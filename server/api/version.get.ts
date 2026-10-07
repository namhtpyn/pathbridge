// Reported in the UI footer. APP_VERSION is baked at docker build from the
// semantic-release version; "dev" for local/non-containerized runs.
export default defineEventHandler(() => ({ version: process.env.APP_VERSION || 'dev' }))
