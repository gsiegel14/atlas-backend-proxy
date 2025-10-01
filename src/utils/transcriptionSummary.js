import { logger } from '../utils/logger.js';

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseTranscriptionSummaryResult(result) {
  if (!result) {
    return null;
  }

  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        return normalize(parsed) || trimmed;
      }
      if (parsed && typeof parsed === 'object') {
        return (
          normalize(parsed.value)
          || normalize(parsed.summary)
          || normalize(parsed.result)
          || normalize(parsed.data)
        );
      }
    } catch {
      return trimmed;
    }

    return trimmed;
  }

  if (typeof result === 'object') {
    const candidate = (
      normalize(result.value)
      || normalize(result.summary)
      || normalize(result.result)
      || normalize(result.data)
    );
    if (candidate) {
      return candidate;
    }

    if (result.result && typeof result.result === 'object') {
      return parseTranscriptionSummaryResult(result.result);
    }
  }

  return null;
}

export async function resolveLlmSummary({
  existingSummary,
  transcript,
  auth0Id,
  foundryService,
  correlationId
}) {
  const summary = normalize(existingSummary);
  if (summary) {
    return summary;
  }

  const normalizedTranscript = normalize(transcript);
  if (!normalizedTranscript) {
    return '';
  }

  const normalizedAuth0Id = normalize(auth0Id);
  if (!normalizedAuth0Id) {
    logger.warn('resolveLlmSummary: Missing auth0Id', { correlationId });
    return '';
  }

  if (!foundryService || typeof foundryService.executeOntologyQuery !== 'function') {
    logger.warn('resolveLlmSummary: Foundry service unavailable', { correlationId });
    return '';
  }

  try {
    const result = await foundryService.executeOntologyQuery('transcriptionSummary', {
      auth0Id: normalizedAuth0Id,
      rawTranscript: normalizedTranscript
    });

    const parsed = parseTranscriptionSummaryResult(result);
    if (parsed) {
      logger.info('resolveLlmSummary: Generated LLM summary', {
        correlationId,
        summaryLength: parsed.length
      });
      return parsed;
    }

    logger.warn('resolveLlmSummary: Empty summary returned', { correlationId });
  } catch (error) {
    logger.error('resolveLlmSummary: Query failed', {
      error: error.message,
      correlationId
    });
  }

  return '';
}

