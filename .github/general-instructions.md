# GitHub Copilot Rules Configuration

## General Behavior
- Proceed with tasks without asking for confirmation unless the action could be destructive or irreversible
- Default to implementing solutions rather than just explaining them
- Use context from the entire codebase when making suggestions
- Prioritize consistency with existing code patterns and conventions

## Code Generation
- Follow the established coding style and patterns in the current project
- Use existing imports and dependencies rather than suggesting new ones when possible
- Generate complete, functional code blocks rather than partial snippets
- Include necessary error handling and edge cases
- Add meaningful comments for complex logic, but avoid obvious comments

## MCP Servers & Tools
- Automatically use appropriate MCP servers when available for tasks like file operations, database queries, or API calls
- Leverage available tools and extensions without prompting
- Integrate with project-specific tooling and configurations

## File Operations
- Create new files when needed for proper code organization
- Update multiple related files simultaneously when changes affect them
- Respect gitignore patterns and project structure

## Testing & Documentation
- Generate unit tests alongside new functions or classes
- Update relevant documentation when modifying public APIs
- Include JSDoc/docstrings for public methods and complex functions

## Dependencies & Configuration
- Suggest adding dependencies to package.json/requirements.txt when introducing new libraries
- Update configuration files when necessary (tsconfig, webpack, etc.)
- Use version ranges that match the project's existing dependency management style

## Refactoring
- Apply refactoring suggestions across all affected files
- Maintain backward compatibility unless explicitly asked to make breaking changes
- Update imports and references when moving or renaming code