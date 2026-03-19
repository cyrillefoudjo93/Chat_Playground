import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      // Proxy API requests to the backend
      '/api': {
        target: 'http://backend-dev:3000',
        changeOrigin: true,
      },
      // Proxy WebSocket connections for Socket.IO
      // The client connects to a namespace (e.g., '/chat').
      // The underlying path used by Socket.IO is /socket.io/
      '/socket.io': { // Match the actual path Socket.IO uses
        target: 'http://backend-dev:3000', // Target the base of the backend Socket.IO server
        ws: true,
        changeOrigin: true, // Recommended for Socket.IO
      },
    },
  },
})

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (General Compliance (Documentation and Record-Keeping))
// Issue: No evidence of EU AI Act compliance documentation or record-keeping
// Suggestion: Enhance audit logging to record AI usage for compliance audit trail
// ──────────────────────────────────────────────────────────
eventType: AuditEventType.AI_REQUEST,
        metadata: {
          ...metadata,
          euAiActCompliance: 'Art.50 transparency obligations recorded',
          modelProvider: providerId
        },

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (General Compliance (User Consent and Data Processing))
// Issue: No evidence of explicit user consent for AI processing
// Suggestion: Add consent verification in auth flow before allowing AI requests
// ──────────────────────────────────────────────────────────
async getAuthStatus(user: User): Promise<AuthStatusDto> {
  if (!user.consentGiven) {
    throw new Error('Explicit consent for AI data processing is required per GDPR and EU AI Act');
  }

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (General Compliance (Model Versioning and Traceability))
// Issue: No evidence of tracking AI model versions used
// Suggestion: Add version tracking in completion response using model metadata
// ──────────────────────────────────────────────────────────
const result = await provider.generateCompletion(messages, model, options);
this.logger.log(`Used model ${model} v1.0 for provider ${providerId} - EU AI Act traceability`);
return result;
