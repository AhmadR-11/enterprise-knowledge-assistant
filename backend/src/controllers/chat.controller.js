// backend/src/controllers/chat.controller.js
const userSpaceModel = require('../models/postgres/userSpace.model');
const retrievalService = require('../services/retrieval.service');
const llmService = require('../services/llm.service');
const auditService = require('../services/audit.service');
const conversationService = require('../services/conversation.service');
const { resolveChatAccess } = require('../services/accessControl.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

/**
 * Helper to write a formatted SSE event to response stream.
 * @param {import('express').Response} res
 * @param {string} event - Event name ('conversation', 'token', 'tool_start', 'tool_end', 'sources', 'done', 'error')
 * @param {Object} data - Event payload to JSON stringify
 */
const sendEvent = (res, event, data) => {
  if (res.writableEnded || !res.writable) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

/**
 * POST /api/chat — Ask questions against indexed space knowledge base (Synchronous)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const handleChatQuery = async (req, res, next) => {
  const { question, spaceId, documentIds, conversationId } = req.body;

  if (!question || !question.trim()) {
    return errorResponse(res, 'Question is required', 400);
  }

  const cleanQuestion = question.trim();

  try {
    // 1. Ensure conversation
    const { conversation } = await conversationService.ensureConversation(
      conversationId,
      req.user.id,
      cleanQuestion
    );

    // 2. Load previous completed message history for context (up to 10 messages, max 8000 chars)
    const history = await conversationService.getRecentContextHistory(conversation.id, req.user.id, 10, 8000);

    // 3. Persist user message for this turn
    await conversationService.saveUserMessage(conversation.id, cleanQuestion);

    const { error: accessError, targetSpaceIds } = await resolveChatAccess(req.user, spaceId);
    if (accessError) {
      await conversationService.saveAssistantMessage({
        conversationId: conversation.id,
        content: '',
        status: 'error',
        errorMessage: accessError.message
      });
      return errorResponse(res, accessError.message, accessError.status);
    }

    const docIdFilter = Array.isArray(documentIds) && documentIds.length > 0 ? documentIds : null;

    // 4. Vector Search Context Retrieval with optional document filtering
    const { contextText, sources } = await retrievalService.retrieveContext(cleanQuestion, targetSpaceIds, 5, docIdFilter);

    // 5. LLM Answer Generation
    const answer = await llmService.generateAnswer(cleanQuestion, contextText, history);

    // 4. Save assistant response
    await conversationService.saveAssistantMessage({
      conversationId: conversation.id,
      content: answer,
      status: 'complete',
      sources
    });

    // 5. Log Audit Query
    await auditService.logAuthAttempt('CHAT_QUERY', req.user.email, req, {
      question: cleanQuestion,
      targetSpaceIds,
      documentIds: docIdFilter,
      sourcesCount: sources.length,
      conversationId: conversation.id
    });

    return successResponse(res, 'Response generated successfully', {
      question: cleanQuestion,
      answer,
      sources,
      targetSpaceIds,
      conversationId: conversation.id,
      conversationTitle: conversation.title
    });
  } catch (err) {
    if (err.status === 404) {
      return errorResponse(res, err.message, 404);
    }
    console.error('Chat query error:', err);
    return next(err);
  }
};

/**
 * POST /api/chat/stream — Ask questions with token-by-token Server-Sent Events (SSE) streaming
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const handleChatStream = async (req, res) => {
  // 1. Flush SSE headers immediately
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  const abortController = new AbortController();
  let isClientDisconnected = false;
  let isStreamFinished = false;

  // 2. Keep-alive heartbeat comment every 15s
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded && res.writable && !isClientDisconnected) {
      res.write(': ping\n\n');
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeatInterval);
  };

  // 3. Client disconnect / abort handling
  const handleDisconnect = () => {
    if (!isClientDisconnected && !isStreamFinished && streamStatus !== 'error') {
      isClientDisconnected = true;
      cleanup();
      abortController.abort();
      console.log('client disconnected, generation cancelled');
    }
  };

  if (typeof req.on === 'function') {
    req.on('close', () => {
      if (!req.socket || req.socket.destroyed || res.destroyed) {
        handleDisconnect();
      }
    });
  }

  if (typeof res.on === 'function') {
    res.on('close', () => {
      handleDisconnect();
    });
  }

  const { question, spaceId, documentIds, conversationId } = req.body || {};
  console.log(`[Stream] Incoming query: "${question}" from user: ${req.user?.email} (spaceId: ${spaceId}, conversationId: ${conversationId})`);

  // 4. Input validation (handles error before first token)
  if (!question || !question.trim()) {
    cleanup();
    sendEvent(res, 'error', {
      code: 'BAD_REQUEST',
      message: 'Question is required'
    });
    return res.end();
  }

  const cleanQuestion = question.trim();

  // Accumulators for stream and database persistence
  let conversation = null;
  let accumulatedText = '';
  let accumulatedToolActivities = [];
  let sources = [];
  let streamStatus = 'complete';
  let safeErrorMessage = null;
  let isPersisted = false;

  try {
    // 5. Ensure or create conversation
    try {
      const convData = await conversationService.ensureConversation(
        conversationId,
        req.user.id,
        cleanQuestion
      );
      conversation = convData.conversation;
    } catch (convErr) {
      cleanup();
      const status = convErr.status || 500;
      const code = convErr.code || (status === 404 ? 'NOT_FOUND' : 'CONVERSATION_ERROR');
      sendEvent(res, 'error', {
        code,
        message: convErr.message || 'Failed to initialize conversation'
      });
      return res.end();
    }

    // Emit 'conversation' event immediately so the client learns the id
    sendEvent(res, 'conversation', {
      id: conversation.id,
      title: conversation.title
    });

    // 6. Load previous completed message history for context (up to 10 messages, max 8000 chars)
    const contextHistory = await conversationService.getRecentContextHistory(conversation.id, req.user.id, 10, 8000);

    // 7. Persist user message BEFORE generation begins
    await conversationService.saveUserMessage(conversation.id, cleanQuestion);

    // 8. Space access authorization check
    console.log('[Stream] Resolving space access...');
    const { error: accessError, targetSpaceIds } = await resolveChatAccess(req.user, spaceId);
    if (accessError) {
      console.warn('[Stream] Access error:', accessError);
      streamStatus = 'error';
      safeErrorMessage = accessError.message;
      sendEvent(res, 'error', {
        code: accessError.code,
        message: accessError.message
      });
      return res.end();
    }
    console.log('[Stream] Target space IDs:', targetSpaceIds);

    const docIdFilter = Array.isArray(documentIds) && documentIds.length > 0 ? documentIds : null;
    const useToolCalling = process.env.USE_TOOL_CALLING !== 'false';

    let finishReason = 'STOP';
    let usage = null;

    if (useToolCalling) {
      console.log('[Stream] Running Agentic Tool Calling flow with history...');
      const userContext = {
        user: req.user,
        targetSpaceIds,
        docIdFilter,
        accumulatedSources: []
      };

      const agentResult = await llmService.runAgentStream({
        question: cleanQuestion,
        userContext,
        history: contextHistory,
        callbacks: {
          onToken: (text) => {
            accumulatedText += text;
            if (!isClientDisconnected && !res.writableEnded && res.writable) {
              sendEvent(res, 'token', { text });
            }
          },
          onToolStart: ({ id, name, argsSummary }) => {
            accumulatedToolActivities.push({
              id,
              name,
              argsSummary,
              status: 'running'
            });
            if (!isClientDisconnected && !res.writableEnded && res.writable) {
              sendEvent(res, 'tool_start', { id, name, argsSummary });
            }
          },
          onToolEnd: ({ id, name, durationMs, resultCount, ok }) => {
            const idx = accumulatedToolActivities.findIndex((a) => a.id === id);
            const toolData = {
              id,
              name,
              durationMs,
              resultCount,
              ok,
              status: ok ? 'done' : 'failed'
            };
            if (idx >= 0) {
              accumulatedToolActivities[idx] = { ...accumulatedToolActivities[idx], ...toolData };
            } else {
              accumulatedToolActivities.push(toolData);
            }
            if (!isClientDisconnected && !res.writableEnded && res.writable) {
              sendEvent(res, 'tool_end', { id, name, durationMs, resultCount, ok });
            }
          }
        },
        options: {
          signal: abortController.signal
        }
      });

      sources = agentResult.sources || [];
      finishReason = agentResult.finishReason || 'STOP';
      usage = agentResult.usage || null;

    } else {
      console.log('[Stream] Running Static RAG fallback flow with history...');
      // Vector Context Retrieval
      let contextText = '';
      try {
        console.log('[Stream] Retrieving vector context...');
        const retrievalResult = await retrievalService.retrieveContext(cleanQuestion, targetSpaceIds, 5, docIdFilter);
        contextText = retrievalResult.contextText;
        sources = retrievalResult.sources || [];
        console.log(`[Stream] Context retrieved: ${sources.length} sources found`);
      } catch (retrievalErr) {
        streamStatus = 'error';
        safeErrorMessage = 'Failed to retrieve context from knowledge base';
        console.error('[Stream] Retrieval error in chat stream:', retrievalErr.message);
        sendEvent(res, 'error', {
          code: 'RETRIEVAL_ERROR',
          message: safeErrorMessage
        });
        return res.end();
      }

      if (isClientDisconnected || res.writableEnded || res.destroyed || abortController.signal.aborted) {
        console.log('[Stream] Client disconnected before generation');
        return;
      }

      // Gemini streaming LLM generation with history
      console.log('[Stream] Calling Gemini generateAnswerStream with history...');
      const streamResult = await llmService.generateAnswerStream(
        cleanQuestion,
        contextText,
        { signal: abortController.signal },
        contextHistory
      );
      console.log('[Stream] Stream established, iterating chunks...');

      if (streamResult?.response && typeof streamResult.response.catch === 'function') {
        streamResult.response.catch(() => {});
      }

      try {
        for await (const chunk of streamResult.stream) {
          if (isClientDisconnected || res.writableEnded || res.destroyed || abortController.signal.aborted) {
            console.log('[Stream] Aborting chunk iteration due to disconnect');
            break;
          }
          const tokenText = typeof chunk.text === 'function' ? chunk.text() : '';
          if (tokenText) {
            accumulatedText += tokenText;
            sendEvent(res, 'token', { text: tokenText });
          }
        }
      } catch (streamErr) {
        if (isClientDisconnected || abortController.signal.aborted || res.writableEnded || res.destroyed) {
          console.log('[Stream] Upstream read stream terminated following client disconnect');
        } else {
          throw streamErr;
        }
      }

      try {
        const finalResp = await streamResult.response;
        if (finalResp.candidates?.[0]?.finishReason) {
          finishReason = finalResp.candidates[0].finishReason;
        }
        if (finalResp.usageMetadata) {
          usage = {
            promptTokens: finalResp.usageMetadata.promptTokenCount,
            completionTokens: finalResp.usageMetadata.candidatesTokenCount,
            totalTokens: finalResp.usageMetadata.totalTokenCount
          };
        }
      } catch {
        // Fallback
      }
    }

    if (isClientDisconnected || res.writableEnded || res.destroyed || abortController.signal.aborted) {
      streamStatus = 'stopped';
      return;
    }

    isStreamFinished = true;

    // Send dedicated 'sources' event if sources exist
    if (sources && sources.length > 0) {
      sendEvent(res, 'sources', sources);
    }

    const donePayload = { finishReason };
    if (usage) donePayload.usage = usage;
    if (sources && sources.length > 0) donePayload.sources = sources;

    sendEvent(res, 'done', donePayload);
    res.end();

    // Audit logging (asynchronous)
    auditService.logAuthAttempt('CHAT_QUERY', req.user.email, req, {
      question: cleanQuestion,
      targetSpaceIds,
      documentIds: docIdFilter,
      sourcesCount: sources.length,
      conversationId: conversation.id,
      mode: 'streaming'
    }).catch(err => console.error('Audit log error in stream:', err.message));

  } catch (err) {
    if (isClientDisconnected || abortController.signal.aborted || res.writableEnded || res.destroyed) {
      streamStatus = 'stopped';
      return;
    }

    streamStatus = 'error';
    console.error('Chat stream generation error:', err.message);

    safeErrorMessage = err.status === 429
      ? 'Rate limit exceeded. Please wait a moment before trying again.'
      : 'An unexpected error occurred while generating the answer.';

    sendEvent(res, 'error', {
      code: 'UPSTREAM_ERROR',
      message: safeErrorMessage
    });
    res.end();
  } finally {
    cleanup();

    // 9. Guaranteed persistence in finally block: save assistant message exactly once
    if (conversation?.id && !isPersisted) {
      isPersisted = true;
      if ((isClientDisconnected || abortController.signal.aborted) && streamStatus !== 'error') {
        streamStatus = 'stopped';
      }

      // Mark any remaining running tools as failed if stream was interrupted
      const finalToolActivities = accumulatedToolActivities.map((a) =>
        a.status === 'running' ? { ...a, status: 'failed' } : a
      );

      try {
        await conversationService.saveAssistantMessage({
          conversationId: conversation.id,
          content: accumulatedText,
          status: streamStatus,
          sources,
          toolActivity: finalToolActivities,
          errorMessage: safeErrorMessage
        });
        console.log(`[Stream] Persisted assistant message for conv: ${conversation.id} (status: ${streamStatus}, chars: ${accumulatedText.length})`);
      } catch (persistErr) {
        console.error('[Stream] Failed to persist assistant message in finally block:', persistErr.message);
      }
    }
  }
};

module.exports = {
  handleChatQuery,
  handleChatStream,
  resolveChatAccess,
  sendEvent
};
