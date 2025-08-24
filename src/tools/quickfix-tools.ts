import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Formats a WorkspaceEdit for display
 */
function formatWorkspaceEdit(edit: vscode.WorkspaceEdit): string {
    const changes: string[] = [];
    
    // Process text document edits
    for (const [uri, edits] of edit.entries()) {
        const filePath = uri.fsPath;
        changes.push(`\n📝 ${filePath}:`);
        
        for (const edit of edits) {
            const startLine = edit.range.start.line + 1;
            const endLine = edit.range.end.line + 1;
            const startChar = edit.range.start.character + 1;
            const endChar = edit.range.end.character + 1;
            
            if (edit.newText === '') {
                changes.push(`  🗑️  Delete lines ${startLine}:${startChar}-${endLine}:${endChar}`);
            } else if (edit.range.isEmpty) {
                changes.push(`  ➕ Insert at ${startLine}:${startChar}: "${edit.newText}"`);
            } else {
                changes.push(`  🔄 Replace lines ${startLine}:${startChar}-${endLine}:${endChar} with: "${edit.newText}"`);
            }
        }
    }
    
    return changes.join('\n');
}

/**
 * Registers MCP quickfix-related tools with the server
 * @param server MCP server instance
 */
export function registerQuickfixTools(server: McpServer): void {
    // Add quickfixes tool
    server.tool(
        'quickfixes_code',
        `Gets or applies VS Code quickfixes/code actions to files.

        WHEN TO USE: Automatically fixing linting errors, applying code suggestions, organizing imports, etc.
        
        Files: If no files are provided, will process all workspace files that have available quickfixes.
        If files are provided, will only process those specific files.
        
        Preview mode: Set dry_run=true to see what changes would be made without applying them.
        Apply mode: Set dry_run=false to actually make the changes.`,
        {
            files: z.array(z.string()).optional().describe('Optional list of file paths to process quickfixes for. If not provided, processes all files with quickfixes'),
            includeSourceActions: z.boolean().optional().default(true).describe('Include source actions like organize imports, format document'),
            dry_run: z.boolean().optional().default(true).describe('Whether to only preview the fixes (true) or actually apply them (false)')
        },
        async ({ files, includeSourceActions = true, dry_run = true }): Promise<CallToolResult> => {
            try {
                let targetFiles: string[] = [];
                let results: string[] = [];

                if (files && files.length > 0) {
                    // Use provided files
                    targetFiles = files;
                } else {
                    // Find all files with diagnostics in workspace
                    const allDiagnostics = vscode.languages.getDiagnostics();
                    targetFiles = allDiagnostics
                        .filter(([uri, diagnostics]) => diagnostics.length > 0)
                        .map(([uri]) => uri.fsPath);
                }

                if (targetFiles.length === 0) {
                    return {
                        content: [{
                            type: 'text',
                            text: 'No files found that require quickfixes.'
                        }]
                    };
                }

                // Process each file
                for (const filePath of targetFiles) {
                    try {
                        const uri = vscode.Uri.file(filePath);
                        const document = await vscode.workspace.openTextDocument(uri);
                        const diagnostics = vscode.languages.getDiagnostics(uri);

                        if (diagnostics.length === 0) {
                            continue;
                        }

                        let processedCount = 0;
                        let previewChanges: string[] = [];

                        // Process quickfixes for each diagnostic
                        for (const diagnostic of diagnostics) {
                            const range = diagnostic.range;
                            
                            // Get code actions for this diagnostic
                            const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                                'vscode.executeCodeActionProvider',
                                uri,
                                range,
                                vscode.CodeActionKind.QuickFix
                            );

                            if (codeActions && codeActions.length > 0) {
                                // Process the first available quickfix
                                const quickfix = codeActions[0];
                                if (quickfix.edit) {
                                    if (dry_run) {
                                        previewChanges.push(formatWorkspaceEdit(quickfix.edit));
                                    } else {
                                        await vscode.workspace.applyEdit(quickfix.edit);
                                    }
                                    processedCount++;
                                } else if (quickfix.command) {
                                    if (dry_run) {
                                        previewChanges.push(`🔧 Command: ${quickfix.command.command}`);
                                    } else {
                                        await vscode.commands.executeCommand(quickfix.command.command, ...quickfix.command.arguments || []);
                                    }
                                    processedCount++;
                                }
                            }
                        }

                        // Apply source actions if requested
                        if (includeSourceActions) {
                            const sourceActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                                'vscode.executeCodeActionProvider',
                                uri,
                                new vscode.Range(0, 0, document.lineCount, 0),
                                vscode.CodeActionKind.Source
                            );

                            if (sourceActions && sourceActions.length > 0) {
                                for (const action of sourceActions) {
                                    // Process common source actions like organize imports
                                    if (action.kind?.value.includes('organizeImports') || 
                                        action.kind?.value.includes('fixAll')) {
                                        if (action.edit) {
                                            if (dry_run) {
                                                previewChanges.push(formatWorkspaceEdit(action.edit));
                                            } else {
                                                await vscode.workspace.applyEdit(action.edit);
                                            }
                                            processedCount++;
                                        } else if (action.command) {
                                            if (dry_run) {
                                                previewChanges.push(`🔧 Source Action: ${action.command.command}`);
                                            } else {
                                                await vscode.commands.executeCommand(action.command.command, ...action.command.arguments || []);
                                            }
                                            processedCount++;
                                        }
                                    }
                                }
                            }
                        }

                        if (processedCount > 0) {
                            if (dry_run) {
                                const changesSummary = previewChanges.length > 0 ? `\n${previewChanges.join('\n')}` : '';
                                results.push(`${filePath}: Would apply ${processedCount} quickfix(es)${changesSummary}`);
                            } else {
                                results.push(`${filePath}: Applied ${processedCount} quickfix(es)`);
                            }
                        } else {
                            results.push(`${filePath}: No applicable quickfixes found`);
                        }

                    } catch (fileError) {
                        results.push(`${filePath}: Error applying quickfixes - ${fileError}`);
                    }
                }

                const action = dry_run ? 'Preview of quickfixes for' : 'Applied quickfixes to';
                const summary = results.length > 0 
                    ? `${action} ${results.length} file(s):\n\n${results.join('\n')}`
                    : `No quickfixes were ${dry_run ? 'found' : 'applied'}.`;

                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: summary
                        }
                    ]
                };
                return result;
            } catch (error) {
                console.error('[apply_quickfixes] Error in tool:', error);
                throw new Error(`Failed to apply quickfixes: ${error}`);
            }
        }
    );
}