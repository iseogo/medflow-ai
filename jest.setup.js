/**
 * Jest — global test defaults (MOCK_MODE safe; webhook tests may set secrets explicitly).
 */
process.env.MOCK_MODE = process.env.MOCK_MODE ?? "true";
process.env.NODE_ENV = "test";
