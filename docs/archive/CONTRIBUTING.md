# Contributing to Nexus Intelligence

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+

### Setup

```bash
git clone https://github.com/abhishec/nexus-intelligence.git
cd nexus-intelligence
pnpm install
pnpm test
```

### Project Structure

```
nexus-intelligence/
├── packages/
│   ├── memory-stack/     # Causal intelligence engine
│   └── domain-agents/    # Domain agent framework
├── examples/             # Runnable examples
└── docs/                 # Documentation
```

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific package
cd packages/memory-stack && pnpm test

# Run tests in watch mode
cd packages/memory-stack && pnpm test:watch

# Run with coverage
pnpm test:coverage
```

### Building

```bash
pnpm build
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`pnpm test`)
5. Commit with a descriptive message
6. Push to your fork
7. Open a Pull Request

### PR Guidelines

- **Include tests** for any new functionality
- **Keep PRs focused** — one feature or fix per PR
- **Update documentation** if you change public APIs
- **Follow existing code style** — pure functions where possible

## Code Style

- **Pure functions preferred** — no side effects, no external state
- **TypeScript strict mode** — all code must pass strict type checking
- **No external dependencies** for core algorithms — keep them self-contained
- **Adapter pattern** for external services (databases, AI APIs)

## Reporting Issues

When reporting issues, please include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Node.js and TypeScript versions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
