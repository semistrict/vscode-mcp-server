import express from "express";
import * as vscode from 'vscode';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from 'http';
import { Request, Response } from 'express';
import { registerFileTools, FileListingCallback } from './tools/file-tools';
import { registerEditTools } from './tools/edit-tools';
import { registerShellTools } from './tools/shell-tools';
import { registerDiagnosticsTools } from './tools/diagnostics-tools';
import { registerSymbolTools } from './tools/symbol-tools';
import { registerExtensionTools } from './tools/extension-tools';
import { registerQuickfixTools } from './tools/quickfix-tools';
import { registerDebugTools } from './tools/debug-tools';
import { registerLaunchConfigTools } from './tools/launch-config-tools';
import { logger } from './utils/logger';

export interface ToolConfiguration {
    file: boolean;
    edit: boolean;
    shell: boolean;
    diagnostics: boolean;
    symbol: boolean;
    extension: boolean;
    quickfix: boolean;
    debug: boolean;
    launchConfig: boolean;
}

export class MCPServer {
    private server: McpServer;
    private transport: StreamableHTTPServerTransport | StdioServerTransport;
    private app?: express.Application;
    private httpServer?: Server;
    private unixServer?: net.Server;
    private port: number;
    private fileListingCallback?: FileListingCallback;
    private terminal?: vscode.Terminal;
    private toolConfig: ToolConfiguration;
    private useUnixSocket: boolean;
    private socketPath?: string;

    public setFileListingCallback(callback: FileListingCallback) {
        this.fileListingCallback = callback;
    }

    constructor(port: number = 3000, terminal?: vscode.Terminal, toolConfig?: ToolConfiguration) {
        this.port = port;
        this.terminal = terminal;
        this.toolConfig = toolConfig || {
            file: true,
            edit: true,
            shell: true,
            diagnostics: true,
            symbol: true,
            extension: true,
            quickfix: true,
            debug: true,
            launchConfig: true
        };

        // Check if we should use Unix domain socket (default to true)
        const config = vscode.workspace.getConfiguration('vscode-mcp-server');
        this.useUnixSocket = config.get<boolean>('useUnixSocket', true);

        if (this.useUnixSocket) {
            // Priority: 1. Config socketPath, 2. Env var, 3. Auto-compute
            const configSocketPath = config.get<string>('socketPath');
            
            if (configSocketPath) {
                this.socketPath = configSocketPath;
                logger.info(`Using Unix domain socket transport at: ${this.socketPath} (from config)`);
            } else if (process.env.VSCODE_MCP_SOCKET) {
                this.socketPath = process.env.VSCODE_MCP_SOCKET;
                logger.info(`Using Unix domain socket transport at: ${this.socketPath} (from env var)`);
            } else {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    const workspaceDir = workspaceFolders[0].uri.fsPath;
                    const projectDirEscaped = workspaceDir.replace(/\//g, '-');
                    this.socketPath = `${process.env.HOME}/.vscode-mcp/projects/${projectDirEscaped}/vscode-mcp.sock`;
                    logger.info(`Using Unix domain socket transport at: ${this.socketPath}`);
                } else {
                    logger.error('No workspace folder found, cannot determine socket path');
                    throw new Error('No workspace folder found for Unix socket path');
                }
            }
        } else {
            this.app = express();
            this.app.use(express.json());
            logger.info(`Using HTTP transport on port: ${port}`);
        }

        // Initialize MCP Server
        this.server = new McpServer({
            name: "vscode-mcp-server",
            version: "1.0.0",
        }, {
            capabilities: {
                logging: {},
                tools: {
                    listChanged: false
                }
            }
        });

        if (this.useUnixSocket) {
            this.transport = new StdioServerTransport();
        } else {
            this.transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });
            this.setupRoutes();
            this.setupEventHandlers();
        }
    }
    
    public setupTools(): void {
        // Register tools from the tools module based on configuration
        if (this.fileListingCallback) {
            logger.info(`Setting up MCP tools with configuration: ${JSON.stringify(this.toolConfig)}`);
            
            // Register file tools if enabled
            if (this.toolConfig.file) {
                registerFileTools(this.server, this.fileListingCallback);
                logger.info('MCP file tools registered successfully');
            } else {
                logger.info('MCP file tools disabled by configuration');
            }
            
            // Register edit tools if enabled
            if (this.toolConfig.edit) {
                registerEditTools(this.server);
                logger.info('MCP edit tools registered successfully');
            } else {
                logger.info('MCP edit tools disabled by configuration');
            }
            
            // Register shell tools if enabled
            if (this.toolConfig.shell) {
                registerShellTools(this.server, this.terminal);
                logger.info('MCP shell tools registered successfully');
            } else {
                logger.info('MCP shell tools disabled by configuration');
            }
            
            // Register diagnostics tools if enabled
            if (this.toolConfig.diagnostics) {
                registerDiagnosticsTools(this.server);
                logger.info('MCP diagnostics tools registered successfully');
            } else {
                logger.info('MCP diagnostics tools disabled by configuration');
            }
            
            // Register symbol tools if enabled
            if (this.toolConfig.symbol) {
                registerSymbolTools(this.server);
                logger.info('MCP symbol tools registered successfully');
            } else {
                logger.info('MCP symbol tools disabled by configuration');
            }
            
            // Register extension tools if enabled
            if (this.toolConfig.extension) {
                registerExtensionTools(this.server);
                logger.info('MCP extension tools registered successfully');
            } else {
                logger.info('MCP extension tools disabled by configuration');
            }
            
            // Register quickfix tools if enabled
            if (this.toolConfig.quickfix) {
                registerQuickfixTools(this.server);
                logger.info('MCP quickfix tools registered successfully');
            } else {
                logger.info('MCP quickfix tools disabled by configuration');
            }
            
            // Register debug tools if enabled
            if (this.toolConfig.debug) {
                registerDebugTools(this.server);
                logger.info('MCP debug tools registered successfully');
            } else {
                logger.info('MCP debug tools disabled by configuration');
            }
            
            // Register launch config tools if enabled
            if (this.toolConfig.launchConfig) {
                registerLaunchConfigTools(this.server);
                logger.info('MCP launch config tools registered successfully');
            } else {
                logger.info('MCP launch config tools disabled by configuration');
            }
        } else {
            logger.warn('File listing callback not set during tools setup');
        }
    }

    private setupRoutes(): void {
        if (!this.app) return;
        
        // Handle POST requests for client-to-server communication
        this.app.post('/mcp', async (req, res) => {
            logger.info(`Request received: ${req.method} ${req.url}`);
            try {
                if (this.transport instanceof StreamableHTTPServerTransport) {
                    await this.transport.handleRequest(req, res, req.body);
                }
            } catch (error) {
                logger.error(`Error handling MCP request: ${error instanceof Error ? error.message : String(error)}`);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32603,
                            message: 'Internal server error',
                        },
                        id: null,
                    });
                }
            }
        });

        // Handle SSE endpoint for server-to-client streaming
        this.app.get('/mcp/sse', async (req, res) => {
            logger.info('Received SSE connection request');
            try {
                if (this.transport instanceof StreamableHTTPServerTransport) {
                    await this.transport.handleRequest(req, res, undefined);
                }
            } catch (error) {
                logger.error(`Error handling SSE request: ${error instanceof Error ? error.message : String(error)}`);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32603,
                            message: 'Internal server error',
                        },
                        id: null,
                    });
                }
            }
        });

        // Handle unsupported methods
        this.app.get('/mcp', async (req, res) => {
            logger.info('Received GET MCP request');
            res.writeHead(405).end(JSON.stringify({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed."
                },
                id: null
            }));
        });

        this.app.delete('/mcp', async (req, res) => {
            logger.info('Received DELETE MCP request');
            res.writeHead(405).end(JSON.stringify({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed."
                },
                id: null
            }));
        });

        // Handle OPTIONS requests for CORS
        this.app.options('/mcp', (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
            res.status(204).end();
        });
    }

    private setupEventHandlers(): void {
        // Log HTTP server events
        if (this.httpServer) {
            this.httpServer.on('error', (error: Error) => {
                logger.error(`[Server] HTTP Server Error: ${error.message}`);
            });

            this.httpServer.on('listening', () => {
                logger.info(`[Server] HTTP Server ready`);
            });

            this.httpServer.on('close', () => {
                logger.info(`[Server] HTTP Server closed`);
            });
        }
    }

    private handleUnixSocketConnection = (socket: net.Socket): void => {
        logger.info('[MCPServer] New client connected to Unix socket');
        
        // Create a new StdioServerTransport for this connection
        const transport = new StdioServerTransport(socket, socket);
        
        // Connect the MCP server to this transport
        this.server.connect(transport).catch((error) => {
            logger.error(`[MCPServer] Failed to connect transport: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    private async startUnixSocketServer(startTime: number): Promise<void> {
        if (!this.socketPath) {
            throw new Error('Socket path not set');
        }
        const socketPath = this.socketPath;
        logger.info(`[MCPServer.start] Starting Unix domain socket server at: ${socketPath}`);
        
        // Ensure the directory exists
        const socketDir = path.dirname(socketPath);
        if (!fs.existsSync(socketDir)) {
            fs.mkdirSync(socketDir, { recursive: true });
        }
        
        // Remove existing socket file if it exists
        if (fs.existsSync(socketPath)) {
            fs.unlinkSync(socketPath);
        }
        
        // Create Unix socket server
        this.unixServer = net.createServer(this.handleUnixSocketConnection);

        // Listen on Unix socket
        return new Promise<void>((resolve, reject) => {
            this.unixServer!.listen(socketPath, () => {
                const totalTime = Date.now() - startTime;
                logger.info(`[MCPServer.start] Unix socket server started (total: ${totalTime}ms)`);
                resolve();
            });

            this.unixServer!.on('error', (error) => {
                logger.error(`[MCPServer.start] Unix socket server error: ${error.message}`);
                reject(error);
            });
        });
    }

    private async startHttpServer(startTime: number): Promise<void> {
        if (!this.app) {
            throw new Error('Express app not initialized for HTTP server');
        }

        logger.info('[MCPServer.start] Connecting transport');
        const transportConnectStart = Date.now();
        await this.server.connect(this.transport);
        const transportConnectTime = Date.now() - transportConnectStart;
        logger.info(`[MCPServer.start] Transport connected (took ${transportConnectTime}ms)`);

        logger.info('[MCPServer.start] Starting HTTP server');
        const httpServerStartTime = Date.now();
        
        return new Promise((resolve) => {
            this.httpServer = this.app!.listen(this.port, '127.0.0.1', () => {
                const httpStartTime = Date.now() - httpServerStartTime;
                logger.info(`[MCPServer.start] HTTP Server started (took ${httpStartTime}ms)`);
                logger.info(`MCP Server listening on localhost:${this.port}`);
                
                const totalTime = Date.now() - startTime;
                logger.info(`[MCPServer.start] Server startup complete (total: ${totalTime}ms)`);
                
                resolve();
            });
        });
    }

    public async start(): Promise<void> {
        try {
            logger.info('[MCPServer.start] Starting MCP server');
            const startTime = Date.now();

            if (this.useUnixSocket) {
                return await this.startUnixSocketServer(startTime);
            } else {
                return await this.startHttpServer(startTime);
            }
        } catch (error) {
            logger.error(`[MCPServer.start] Failed to start MCP Server: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    private async closeHttpServer(forceTimeout: number): Promise<void> {
        if (!this.httpServer) return;

        logger.info('[MCPServer.stop] Closing HTTP server (with timeout)');
        const httpServerCloseStart = Date.now();
        
        await Promise.race([
            // Normal close operation
            new Promise<void>((resolve, reject) => {
                this.httpServer!.close((err) => {
                    const httpCloseTime = Date.now() - httpServerCloseStart;
                    if (err) {
                        logger.error(`[MCPServer.stop] HTTP server closed with error: ${err.message} (took ${httpCloseTime}ms)`);
                        reject(err);
                    } else {
                        logger.info(`[MCPServer.stop] HTTP server closed successfully (took ${httpCloseTime}ms)`);
                        resolve();
                    }
                });
            }),
            
            // Timeout fallback
            new Promise<void>((resolve) => {
                setTimeout(() => {
                    logger.warn(`[MCPServer.stop] HTTP server close timed out after ${forceTimeout}ms - forcing close`);
                    // We resolve anyway to continue with the shutdown process
                    resolve();
                }, forceTimeout);
            })
        ]);
    }

    private async closeUnixServer(forceTimeout: number): Promise<void> {
        if (!this.unixServer) return;

        logger.info('[MCPServer.stop] Closing Unix socket server (with timeout)');
        const unixServerCloseStart = Date.now();
        
        await Promise.race([
            // Normal close operation
            new Promise<void>((resolve, reject) => {
                this.unixServer!.close((err) => {
                    const unixCloseTime = Date.now() - unixServerCloseStart;
                    if (err) {
                        logger.error(`[MCPServer.stop] Unix socket server closed with error: ${err.message} (took ${unixCloseTime}ms)`);
                        reject(err);
                    } else {
                        logger.info(`[MCPServer.stop] Unix socket server closed successfully (took ${unixCloseTime}ms)`);
                        resolve();
                    }
                });
            }),
            
            // Timeout fallback
            new Promise<void>((resolve) => {
                setTimeout(() => {
                    logger.warn(`[MCPServer.stop] Unix socket server close timed out after ${forceTimeout}ms - forcing close`);
                    resolve();
                }, forceTimeout);
            })
        ]);
    }

    private async closeTransportAndServer(): Promise<void> {
        if (!this.useUnixSocket) {
            logger.info('[MCPServer.stop] Closing transport');
            const transportCloseStart = Date.now();
            await this.transport.close();
            const transportCloseTime = Date.now() - transportCloseStart;
            logger.info(`[MCPServer.stop] Transport closed (took ${transportCloseTime}ms)`);
        }
        
        logger.info('[MCPServer.stop] Closing MCP server');
        const serverCloseStart = Date.now();
        await this.server.close();
        const serverCloseTime = Date.now() - serverCloseStart;
        logger.info(`[MCPServer.stop] MCP server closed (took ${serverCloseTime}ms)`);
    }

    public async stop(forceTimeout: number = 5000): Promise<void> {
        logger.info('[MCPServer.stop] Starting server shutdown process');
        const stopStartTime = Date.now();
        
        try {
            // Close the appropriate server type
            if (this.useUnixSocket) {
                await this.closeUnixServer(forceTimeout);
            } else {
                await this.closeHttpServer(forceTimeout);
            }

            // Close transport and MCP server
            await this.closeTransportAndServer();
            
            const totalStopTime = Date.now() - stopStartTime;
            logger.info(`[MCPServer.stop] MCP Server shutdown complete (total: ${totalStopTime}ms)`);
        } catch (error) {
            logger.error(`[MCPServer.stop] Error during server shutdown: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}