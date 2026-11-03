// backend/src/controllers/chat.controller.js
const userSpaceModel = require('../models/postgres/userSpace.model');
const retrievalService = require('../services/retrieval.service');
const llmService = require('../services/llm.service');
const auditService = require('../services/audit.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

/**
 * Resolves space authorization for the requesting user.
 * Shared between synchronous and streaming chat handlers.
 * @param {Object} user - Authenticated user object from req.user
 * @param {string|number} [spaceId] - Optional spaceId from request body
 * @returns {Promise<{ targetSpaceIds?: number[] | null, error?: { status: number, code: string, message: string } }>}
 */
const resolveChatAccess = async (user, spaceId) => {
  let targetSpaceIds = null;

  if (user.role !== 'admin') {
    const userSpaces = await userSpaceModel.listSpacesForUser(user.id);

    if (!userSpaces || userSpaces.length === 0) {
      return {
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: 'Access Denied: You are not currently assigned to any space'
        }
      };
    }

    if (spaceId) {
      const sId = parseInt(spaceId, 10);
      if (isNaN(sId) || !userSpaces.includes(sId)) {
        return {
          error: {
            status: 403,
            code: 'FORBIDDEN',
            message: 'Access Denied: You do not have access to this space'
          }
        };
      }
      targetSpaceIds = [sId];
    } else {
      targetSpaceIds = userSpaces;
    }
  } else {
    if (spaceId) {
      const sId = parseInt(spaceId, 10);
      if (!isNaN(sId)) {
        targetSpaceIds = [sId];
      }
    }
  }

  return { targetSpaceIds };
};

/**
 * Helper to write a formatted SSE event to response stream.
 * @param {import('express').Response} res
 * @param {string} event - Event name ('token', 'done', 'error')
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
  const { question, spaceId, documentIds } = req.body;

  if (!question || !question.trim()) {
    return errorResponse(res, 'Question is required', 400);
  }

  try {
    const { error: accessError, targetSpaceIds } = await resolveChatAccess(req.user, spaceId);
    if (accessError) {
      return errorResponse(res, accessError.message, accessError.status);
    }

    const docIdFilter = Array.isArray(documentIds) && documentIds.length > 0 ? documentIds : null;

    // 1. Vector Search Context Retrieval with optional document filtering
    const { contextText, sources } = await retrievalService.retrieveContext(question.trim(), targetSpaceIds, 5, docIdFilter);

    // 2. LLM Answer Generation
    const answer = await llmService.generateAnswer(question.trim(), contextText);

    // 3. Log Audit Query
    await auditService.logAuthAttempt('CHAT_QUERY', req.user.email, req, {
      question: question.trim(),
      targetSpaceIds,
      documentIds: docIdFilter,
      sourcesCount: sources.length
    });

    return successResponse(res, 'Response generated successfully', {
      question: question.trim(),
      answer,
      sources,
      targetSpaceIds
    });
  } catch (err) {
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

  // 3. Client disconnect listener
  const handleDisconnect = () => {
    if (!isStreamFinished && !res.writableEnded) {
      isClientDisconnected = true;
      cleanup();
      abortController.abort();
      console.log('client disconnected, generation cancelled');
    }
  };

  if (typeof req.on === 'function') {
    req.on('close', () => {
      // In real Express, req.socket is present. After body parsing, req emits 'close' while req.socket is still open.
      // An actual client disconnect happens when req.socket is destroyed or in mock environments where req.socket is omitted.
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

  const { question, spaceId, documentIds } = req.body || {};
  console.log(`[Stream] Incoming query: "${question}" from user: ${req.user?.email} (spaceId: ${spaceId})`);

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

  try {
    // 5. Space access authorization check
    console.log('[Stream] Resolving space access...');
    const { error: accessError, targetSpaceIds } = await resolveChatAccess(req.user, spaceId);
    if (accessError) {
      console.warn('[Stream] Access error:', accessError);
      cleanup();
      sendEvent(res, 'error', {
        code: accessError.code,
        message: accessError.message
      });
      return res.end();
    }
    console.log('[Stream] Target space IDs:', targetSpaceIds);

    const docIdFilter = Array.isArray(documentIds) && documentIds.length > 0 ? documentIds : null;
    const useToolCalling = process.env.USE_TOOL_CALLING !== 'false';

    let sources = [];
    let finishReason = 'STOP';
    let usage = null;

    if (useToolCalling) {
      console.log('[Stream] Running Agentic Tool Calling flow...');
      const userContext = {
        user: req.user,
        targetSpaceIds,
        docIdFilter,
        accumulatedSources: []
      };

      const agentResult = await llmService.runAgentStream({
        question: cleanQuestion,
        userContext,
        callbacks: {
          onToken: (text) => {
            if (!isClientDisconnected && !res.writableEnded && res.writable) {
              sendEvent(res, 'token', { text });
            }
          },
          onToolStart: ({ id, name, argsSummary }) => {
            if (!isClientDisconnected && !res.writableEnded && res.writable) {
              sendEvent(res, 'tool_start', { id, name, argsSummary });
            }
          },
          onToolEnd: ({ id, name, durationMs, resultCount, ok }) => {
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
      console.log('[Stream] Running Static RAG fallback flow...');
      // 6. Vector Context Retrieval
      let contextText = '';
      try {
        console.log('[Stream] Retrieving vector context...');
        const retrievalResult = await retrievalService.retrieveContext(cleanQuestion, targetSpaceIds, 5, docIdFilter);
        contextText = retrievalResult.contextText;
        sources = retrievalResult.sources || [];
        console.log(`[Stream] Context retrieved: ${sources.length} sources found`);
      } catch (retrievalErr) {
        cleanup();
        console.error('[Stream] Retrieval error in chat stream:', retrievalErr.message);
        sendEvent(res, 'error', {
          code: 'RETRIEVAL_ERROR',
          message: 'Failed to retrieve context from knowledge base'
        });
        return res.end();
      }

      if (isClientDisconnected || res.writableEnded || res.destroyed || abortController.signal.aborted) {
        console.log('[Stream] Client disconnected before generation');
        cleanup();
        return;
      }

      // 7. Gemini streaming LLM generation
      console.log('[Stream] Calling Gemini generateAnswerStream...');
      const streamResult = await llmService.generateAnswerStream(cleanQuestion, contextText, {
        signal: abortController.signal
      });
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
      cleanup();
      return;
    }

    isStreamFinished = true;
    cleanup();

    // Send dedicated 'sources' event if sources exist
    if (sources && sources.length > 0) {
      sendEvent(res, 'sources', sources);
    }

    const donePayload = { finishReason };
    if (usage) donePayload.usage = usage;
    if (sources && sources.length > 0) donePayload.sources = sources;

    sendEvent(res, 'done', donePayload);
    res.end();

    // 9. Audit logging (asynchronous)
    auditService.logAuthAttempt('CHAT_QUERY', req.user.email, req, {
      question: cleanQuestion,
      targetSpaceIds,
      documentIds: docIdFilter,
      sourcesCount: sources.length,
      mode: 'streaming'
    }).catch(err => console.error('Audit log error in stream:', err.message));

  } catch (err) {
    cleanup();

    if (isClientDisconnected || abortController.signal.aborted || res.writableEnded || res.destroyed) {
      return;
    }

    console.error('Chat stream generation error:', err.message);

    const safeMessage = err.status === 429
      ? 'Rate limit exceeded. Please wait a moment before trying again.'
      : 'An unexpected error occurred while generating the answer.';

    sendEvent(res, 'error', {
      code: 'UPSTREAM_ERROR',
      message: safeMessage
    });
    res.end();
  }
};

module.exports = {
  handleChatQuery,
  handleChatStream,
  resolveChatAccess,
  sendEvent
};


