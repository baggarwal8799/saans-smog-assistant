// Full click-through of every control on a running build (ideally the Docker image), with REAL services.
// Usage:  docker compose up --build -d
//         BASE_URL=http://127.0.0.1:8080 npm run check:clickthrough
// Set EXPECT_AI=true when GEMINI_API_KEY is configured: it then also checks the real Gemini answers.
// Prints a step-by-step report and saves screenshots of every step to ./screenshots/clickthrough.
import './clickthrough/index.mjs';
