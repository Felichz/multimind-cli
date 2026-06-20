/**
 * Public API surface of the CLI.
 *
 * Every import a consumer needs is exported here. Deep paths
 * (`multimind-cli/llm/provider`, `multimind-cli/judge`, etc.)
 * still work for cases where a consumer wants to depend on a
 * specific module, but the canonical import is from the root:
 *
 *     import {
 *       runThinkingPipeline,
 *       OpenAICompatProvider,
 *       type LLMProvider,
 *       type LLMRequest,
 *       type ThinkingInput,
 *       type ThinkingOutput,
 *       judgeThinking,
 *     } from "multimind-cli"
 *
 * Modules that are not re-exported here (the consolidator, the
 * engines, the run record) are implementation details. They are
 * namespace-exported for advanced consumers who need them.
 */

export { runThinkingPipeline, type PipelineOptions } from "./pipeline/run"
export { OpenAICompatProvider, type OpenAICompatConfig } from "./llm/openai-compat"
export type { LLMProvider, LLMRequest, LLMResponse, LLMMessage, LLMError } from "./llm/provider"
export { judgeThinking, parseJudgeResponse, type JudgeInput, type JudgeResult } from "./judge"
export * as Consolidator from "./consolidator"
export * as Research from "./engines/research-engine"
export * as Evolution from "./engines/evolution-engine"
export * from "./types"
export { DEFAULT_CONFIG } from "./types"
