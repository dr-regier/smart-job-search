# MCP (Model Context Protocol) Integration

This directory contains MCP client abstractions for connecting to remote MCP servers.

## Critical Rule

**ALWAYS fetch and read the provided documentation before implementing any MCP-related code.**

## Documentation

### AI SDK MCP Tools Integration

https://ai-sdk.dev/cookbook/node/mcp-tools

This documentation covers:

- How to create MCP clients with AI SDK
- Streamable HTTP, stdio, and transport options
- Tool retrieval and combination patterns
- Integration with `generateText()` and `streamText()`
- Best practices for MCP client management

### MCP Protocol Specification

https://modelcontextprotocol.io/specification/2025-03-26/basic/transports

Official MCP transport documentation including Streamable HTTP transport details.

## Current Implementation

This project uses **Streamable HTTP transport (MCP v3)** for connecting to Firecrawl's MCP server:

- **Transport**: `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js`
- **Endpoint**: `https://mcp.firecrawl.dev/{API_KEY}/v2/mcp`
- **SDK Version**: `@modelcontextprotocol/sdk` 1.18.2+

**Migration Note**: As of January 2025, the deprecated SSE transport was replaced with Streamable HTTP transport following Firecrawl's upgrade to MCP v3.

## Usage Pattern

1. Read the documentation links above before making changes
2. Follow the existing patterns in `/lib/mcp/client/`
3. Use **Streamable HTTP transport** for hosted MCP servers (current standard)
4. Always handle errors and add logging
5. Load credentials from environment variables

## Important Tips

- **Never disconnect MCP clients during streaming**: When using `streamText()`, tools may be called during the stream. Closing the client prematurely causes "closed client" errors.
- **Singleton pattern for connection reuse**: Use the singleton to maintain persistent connections across requests for better performance.

- **Type compatibility**: Use `Record<string, any>` for tool return types to ensure compatibility with AI SDK's `streamText()`.
