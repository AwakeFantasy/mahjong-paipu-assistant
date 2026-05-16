# Paipu Fixtures

This directory contains local regression fixtures for the paipu review pipeline.

The first committed fixture is synthetic. It is shaped like a MajSoul record but does not contain a real paipu URL or real account identifiers. Real-world fixtures can be added later after removing private identifiers and replacing the original URL with a digest.

Each fixture should document:

- `id`: stable fixture id
- `tags`: behavior covered by the fixture
- `source`: synthetic or sanitized real source metadata
- `game`: raw record payload used by tests
- `expected`: stable assertions for import, playback, decision points, and analysis fallbacks

Default regression tests must stay offline. Network smoke tests should be opt-in and separate from the normal `npm.cmd run test` path.
