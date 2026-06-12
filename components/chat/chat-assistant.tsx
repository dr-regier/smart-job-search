"use client";

import React, { useState, useEffect, useRef, memo } from "react";
import { type ToolUIPart } from "ai";
import type { Job } from "@/types/job";
import { useChatContext } from "@/lib/context/ChatContext";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Briefcase } from "lucide-react";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from "@/components/ai-elements/sources";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Response } from "@/components/ai-elements/response";
import { JobCarousel } from "@/components/jobs/JobCarousel";
import { Button } from "@/components/ui/button";

// RAG Tool types for proper TypeScript support
type RAGToolInput = {
  query: string;
};

type RAGToolOutput = {
  context: string;
  sources: Array<{
    sourceType: 'url';
    id: string;
    url: string;
    title: string;
  }>;
  chatSources?: Array<{
    url: string;
    title: string;
  }>;
};

type RAGToolUIPart = ToolUIPart<{
  retrieveKnowledgeBase: {
    input: RAGToolInput;
    output: RAGToolOutput;
  };
}>;

interface ChatAssistantProps {
  // No props needed - all state managed by ChatContext
}

/**
 * Helper function to get display info for tool calls based on agent and tool name
 */
const getToolDisplayInfo = (toolName: string, agentSource: 'discovery' | 'matching') => {
  // Saving is shared across agents and unambiguous.
  if (toolName.includes('saveJobs')) {
    return { icon: '💾', text: 'Saving jobs' };
  }

  if (agentSource === 'discovery') {
    // Narrate the actual step instead of a single generic "Searching" so a long
    // wait reads as progress. Firecrawl MCP tools arrive as dynamic `firecrawl_*`
    // names; the custom tools are `searchAdzunaJobs` / `displayJobs`.
    if (toolName.includes('Adzuna') || toolName.includes('adzuna')) {
      return { icon: '🔍', text: 'Searching job boards' };
    }
    if (toolName.includes('Ats') || toolName.includes('ats')) {
      return { icon: '🏢', text: 'Checking company boards' };
    }
    if (toolName.includes('displayJobs')) {
      return { icon: '📋', text: 'Preparing results' };
    }
    if (toolName.includes('firecrawl') || toolName.includes('scrape') || toolName.includes('crawl')) {
      return { icon: '🌐', text: 'Reading company pages' };
    }
    if (toolName.includes('search')) {
      return { icon: '🌐', text: 'Searching the web' };
    }
    return { icon: '🔍', text: 'Searching for jobs' };
  }

  // Matching agent - reading pages vs. scoring.
  if (toolName.includes('firecrawl') || toolName.includes('scrape') || toolName.includes('search')) {
    return { icon: '🌐', text: 'Researching the role' };
  }
  return { icon: '📊', text: 'Scoring jobs' };
};

// Memoized components for better performance
const MemoizedToolCall = memo(({
  toolPart,
  displayName,
  shouldBeExpanded
}: {
  toolPart: RAGToolUIPart;
  displayName: string;
  shouldBeExpanded: boolean;
}) => (
  <Tool defaultOpen={shouldBeExpanded}>
    <ToolHeader
      type={displayName as any}
      state={toolPart.state}
    />
    <ToolContent>
      {toolPart.state === "input-streaming" && (
        <div className="text-sm text-muted-foreground p-2">
          🔍 {displayName}...
        </div>
      )}
      {toolPart.input && toolPart.state !== "input-streaming" && (
        <ToolInput input={toolPart.input} />
      )}
      {toolPart.output && (
        <ToolOutput
          output={toolPart.output}
          errorText={toolPart.errorText}
        />
      )}
    </ToolContent>
  </Tool>
));

MemoizedToolCall.displayName = 'MemoizedToolCall';

/**
 * Simplified agent-specific tool indicator
 * Shows user-friendly messages instead of technical tool names
 */
const AgentToolIndicator = memo(({
  icon,
  text,
  toolPart
}: {
  icon: string;
  text: string;
  toolPart: RAGToolUIPart;
}) => {
  const isActive = toolPart.state === "input-streaming" || toolPart.state === "input-available";

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg border">
      <span className="text-base">{icon}</span>
      <span className={isActive ? "animate-pulse" : ""}>
        {text}
        {isActive && "..."}
      </span>
    </div>
  );
});

AgentToolIndicator.displayName = 'AgentToolIndicator';

/**
 * Generic "agent is working" indicator. Fills the silent gaps where no tool is
 * actively running and no assistant text is streaming yet (e.g. the wait before
 * the first tool call, or between a finished tool and the next step) - so a long
 * search reads as alive rather than stuck. Pairs with AgentToolIndicator, which
 * covers the moments a specific tool is running.
 */
const AgentThinkingIndicator = memo(() => (
  <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg border">
    <span className="text-base">💭</span>
    <span className="animate-pulse">Thinking...</span>
  </div>
));

AgentThinkingIndicator.displayName = 'AgentThinkingIndicator';

const MemoizedMessage = memo(({
  message,
  isStreaming,
  children
}: {
  message: any;
  isStreaming: boolean;
  children?: React.ReactNode;
}) => {
  // Only handle text parts
  const textParts = message.parts?.filter((p: any) => p.type === 'text') || [];

  return (
    <>
      {/* Render text message if there's content */}
      {(textParts.length > 0 || message.content) && (
        <Message from={message.role}>
          <MessageContent>
            <Response>
              {textParts.map((part: any, i: number) => part.text).join('') || message.content || ""}
            </Response>
          </MessageContent>
          {children}
        </Message>
      )}
    </>
  );
});

MemoizedMessage.displayName = 'MemoizedMessage';

export default function ChatAssistant({}: ChatAssistantProps) {
  // Get all chat state and methods from context
  const {
    discoveryChat,
    carouselJobs,
    clearSessionJobs,
    removeJobFromSession,
    logJobSignal,
    refreshSavedJobs,
    carouselVisible,
    setCarouselVisible,
    messageOrderRef,
    nextOrderRef,
    handleSendMessage,
    clearChat,
  } = useChatContext();

  // Chat is discovery-only. Tag messages with agentSource so the tool-label
  // helper keeps working, and assign stable insertion order for rendering.
  const allRawMessages = React.useMemo(() => {
    const discovery = discoveryChat.messages.map(msg => ({
      ...msg,
      agentSource: 'discovery' as const
    }));

    discovery.forEach(msg => {
      if (!messageOrderRef.current.has(msg.id)) {
        messageOrderRef.current.set(msg.id, nextOrderRef.current++);
      }
    });

    return discovery.sort((a, b) => {
      const orderA = messageOrderRef.current.get(a.id) ?? 0;
      const orderB = messageOrderRef.current.get(b.id) ?? 0;
      return orderA - orderB;
    });
  }, [discoveryChat.messages, messageOrderRef, nextOrderRef]);

  const status = discoveryChat.status;

  // Debounced messages for performance - update every 30ms instead of every token
  const [debouncedMessages, setDebouncedMessages] = useState(allRawMessages);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Voice input ref and state
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [inputValue, setInputValue] = useState("");
  const lastRawMessagesRef = useRef(allRawMessages);

  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Check for critical events that need immediate updates
    const needsImmediateUpdate = () => {
      // Update immediately when streaming stops
      if (status !== 'streaming' && lastRawMessagesRef.current !== allRawMessages) {
        return true;
      }

      // Update immediately when tool calls appear/change
      const hasNewToolCalls = allRawMessages.some(msg =>
        (msg as any).parts?.some((p: any) => p.type?.startsWith('tool-')) &&
        !lastRawMessagesRef.current.some(oldMsg => oldMsg.id === msg.id)
      );

      if (hasNewToolCalls) {
        return true;
      }

      return false;
    };

    if (needsImmediateUpdate()) {
      // Immediate update for critical events
      setDebouncedMessages(allRawMessages);
      lastRawMessagesRef.current = allRawMessages;
    } else {
      // Debounced update for regular streaming
      debounceTimerRef.current = setTimeout(() => {
        setDebouncedMessages(allRawMessages);
        lastRawMessagesRef.current = allRawMessages;
      }, 30);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [allRawMessages, status]);

  // Use debounced messages for rendering
  const messages = debouncedMessages;

  // Simplified submit handler - routing logic is in context
  const handleSubmit = async (
    message: { text?: string; files?: any[] },
    event: React.FormEvent
  ) => {
    if (!message.text?.trim() || status === "streaming") return;

    const messageText = message.text.trim();

    // Clear the form immediately after extracting the message
    const form = (event.target as Element)?.closest("form") as HTMLFormElement;
    if (form) {
      form.reset();
    }

    // Clear input value state
    setInputValue("");

    // Send message through context - it handles intelligent routing
    handleSendMessage(messageText);
  };

  // Handler for voice transcript
  const handleVoiceTranscript = (transcript: string) => {
    // Update the input value
    setInputValue(transcript);

    // Focus the textarea for user review
    if (textareaRef.current) {
      textareaRef.current.value = transcript;
      textareaRef.current.focus();

      // Trigger input event for proper form state update
      const event = new Event('input', { bubbles: true });
      textareaRef.current.dispatchEvent(event);
    }
  };

  // Handlers for JobCarousel
  const handleJobSaved = (job: Job) => {
    // Capture the save as a preference signal (Bet B), fire-and-forget
    logJobSignal("saved", job);
    // Remove job from carousel after saving
    removeJobFromSession(job.id);
    // Refresh saved jobs list
    refreshSavedJobs();
  };

  const handleJobSkipped = (job: Job) => {
    // Capture an explicit skip as a preference signal (Bet B), fire-and-forget
    logJobSignal("skipped", job);
  };

  const handleCarouselComplete = () => {
    // Clear session jobs when carousel is complete
    clearSessionJobs();
    setCarouselVisible(false);
  };

  const handleCarouselClose = () => {
    // Just hide the carousel, don't clear jobs
    setCarouselVisible(false);
  };

  const isLoading = status === "streaming";

  return (
    <div className="flex flex-col lg:flex-row h-full max-h-full overflow-hidden">
      {/* Main chat area - 60% width on desktop */}
      <div className="flex flex-col flex-1 lg:w-[60%] h-full overflow-hidden">
        <Conversation className="flex-1 h-0 overflow-hidden">
          <ConversationContent className="space-y-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Chat with me to find jobs of interest"
              description="I can search for specific roles or companies, or browse jobs in your area."
            />
          ) : (
            (() => {
              // Extract flow items (messages + tool calls) in chronological order
              const flowItems: Array<{
                type: 'message' | 'tool-call';
                data: any;
                id: string;
                messageId?: string;
                agentSource?: 'discovery' | 'matching';
                toolName?: string;
                partIndex?: number;
              }> = [];

              messages.forEach((message) => {
                // Process all parts in chronological order
                const parts = (message as any).parts || [];
                const agentSource = (message as any).agentSource;

                parts.forEach((part: any, partIndex: number) => {
                  if (part.type?.startsWith('tool-')) {
                    // Handle tool calls
                    const uniqueId = part.toolCallId ||
                                    part.id ||
                                    `${message.id}-${part.type}-${partIndex}`;

                    // Extract tool name from the part (toolName field or from type)
                    const toolName = part.toolName || part.type?.replace('tool-', '') || '';

                    flowItems.push({
                      type: 'tool-call',
                      data: part,
                      id: `tool-${uniqueId}`,
                      messageId: message.id,
                      agentSource,
                      toolName,
                      partIndex
                    });
                  }
                  // text parts will be handled in the message itself
                });

                // Add the message itself (with only text parts and legacy content)
                const messageWithTextOnly = {
                  ...message,
                  parts: parts.filter((part: any) =>
                    part.type === 'text' || !part.type // include parts without type for backward compatibility
                  )
                };

                // Only add message if it has content (text or legacy content)
                const hasContent = messageWithTextOnly.parts.length > 0 || !!(message as any).content;
                if (hasContent) {
                  flowItems.push({
                    type: 'message',
                    data: messageWithTextOnly,
                    id: `message-${message.id}`
                  });
                }
              });

              // Check for duplicate keys and log errors only
              const allIds = flowItems.map(item => item.id);
              const duplicateIds = allIds.filter((id, index) => allIds.indexOf(id) !== index);
              if (duplicateIds.length > 0) {
                console.error(`🚨 Duplicate keys found:`, duplicateIds);
              }

              const renderedItems = flowItems.map((item, itemIndex) => {
                if (item.type === 'tool-call') {
                  // Render agent-specific tool indicator
                  const toolPart = item.data as RAGToolUIPart;

                  // Get display info based on agent and tool name
                  const agentSource = item.agentSource || 'discovery'; // Default to discovery
                  const toolName = item.toolName || '';
                  const displayInfo = getToolDisplayInfo(toolName, agentSource);

                  return (
                    <div key={item.id} className="w-full mb-3">
                      <AgentToolIndicator
                        icon={displayInfo.icon}
                        text={displayInfo.text}
                        toolPart={toolPart}
                      />
                    </div>
                  );
                } else {
                  // Render regular message
                  const message = item.data;

                  // Generate sources component
                  const sourcesComponent = message.role === 'assistant' && (() => {
                        // Strict check for actual text content - don't show sources without real text
                        const hasRealTextContent = (
                          message.parts?.some((p: any) => p.type === 'text' && p.text?.trim()) ||
                          (message.content?.trim())
                        );

                        if (!hasRealTextContent) {
                          // No real text content = never show sources (prevents showing below tool calls)
                          return null;
                        }

                        // Look backward through flow items for recent tool results
                        let toolSources: any[] = [];

                        for (let i = itemIndex - 1; i >= 0; i--) {
                          const prevItem = flowItems[i];
                          if (prevItem.type === 'tool-call') {
                            const toolData = prevItem.data as RAGToolUIPart;
                            if (toolData.type === 'tool-retrieveKnowledgeBase' && toolData.output?.sources) {
                              toolSources = toolData.output.sources;
                              break;
                            }
                          }
                        }

                        if (toolSources.length > 0) {
                          return (
                            <div className="mt-4">
                              <Sources>
                                <SourcesTrigger count={toolSources.length} />
                                <SourcesContent>
                                  {toolSources.map((source: any, i: number) => (
                                    <Source
                                      key={`source-${item.id}-${i}`}
                                      href={source.url}
                                      title={source.title}
                                    />
                                  ))}
                                </SourcesContent>
                              </Sources>
                            </div>
                          );
                        }
                        return null;
                      })();

                  return (
                    <div key={item.id} className="w-full">
                      <MemoizedMessage message={message} isStreaming={isLoading} />
                      {sourcesComponent}
                    </div>
                  );
                }
              });

              // Show a generic working state when streaming but nothing is
              // actively narrating progress: no tool currently running and no
              // assistant text streaming yet (the initial wait, or the beat
              // between a finished tool and the next step).
              const lastItem = flowItems[flowItems.length - 1];
              const lastIsActiveTool = lastItem?.type === 'tool-call' &&
                (lastItem.data?.state === 'input-streaming' || lastItem.data?.state === 'input-available');
              const lastIsAssistantText = lastItem?.type === 'message' &&
                lastItem.data?.role === 'assistant';
              const showThinking = isLoading && !lastIsActiveTool && !lastIsAssistantText;

              return (
                <>
                  {renderedItems}
                  {showThinking && (
                    <div className="w-full mb-3">
                      <AgentThinkingIndicator />
                    </div>
                  )}
                </>
              );
            })()
          )}
        </ConversationContent>
      </Conversation>

        <div className="p-4 flex-shrink-0 border-t">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <div className="flex items-start gap-2 px-2 pt-2">
                <VoiceInputButton
                  onTranscript={handleVoiceTranscript}
                  disabled={status === "streaming"}
                />
                <div className="flex-1">
                  <PromptInputTextarea
                    ref={textareaRef}
                    placeholder="Tell me what you are looking for..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                </div>
              </div>
              <PromptInputToolbar>
                <div className="flex items-center gap-2 ml-8">
                  {/* New Chat Button */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="text-xs">New Chat</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will start a fresh conversation. Your saved jobs and profile
                          data will be preserved. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={clearChat}>
                          Clear Chat
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <PromptInputSubmit status={isLoading ? "submitted" : undefined} />
              </PromptInputToolbar>
            </PromptInputBody>
          </PromptInput>
        </div>
      </div>

      {/* Job Carousel - side panel on desktop, overlay on mobile */}
      {carouselVisible && (
        <>
          {/* Desktop: Side panel (40% width) */}
          <div className="hidden lg:flex lg:w-[40%] border-l bg-background">
            <JobCarousel
              jobs={carouselJobs}
              onJobSaved={handleJobSaved}
              onJobSkipped={handleJobSkipped}
              onComplete={handleCarouselComplete}
              onClose={handleCarouselClose}
            />
          </div>

          {/* Mobile: Full screen overlay */}
          <div className="lg:hidden fixed inset-0 z-50 bg-black/50 animate-in fade-in">
            <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-background shadow-2xl animate-in slide-in-from-right">
              <JobCarousel
                jobs={carouselJobs}
                onJobSaved={handleJobSaved}
                onJobSkipped={handleJobSkipped}
                onComplete={handleCarouselComplete}
                onClose={handleCarouselClose}
              />
            </div>
          </div>
        </>
      )}

      {/* Reopen Carousel Button - show when carousel is hidden */}
      {!carouselVisible && (
        <div className="fixed bottom-24 right-6 z-40">
          <Button
            onClick={() => setCarouselVisible(true)}
            size="lg"
            className="shadow-lg bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            <Briefcase className="w-5 h-5" />
            {carouselJobs.length > 0 ? `View Discovered Jobs (${carouselJobs.length})` : 'Open Job Explorer'}
          </Button>
        </div>
      )}
    </div>
  );
}
