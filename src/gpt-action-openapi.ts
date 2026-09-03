export const gptActionOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "Loom credential handoff",
    version: "1.0.0",
    description: "Recognize a conversation-supplied Loom project credential without creating a session.",
  },
  servers: [{ url: "https://loom.metasemantix.workers.dev" }],
  paths: {
    "/api/gpt-action/authenticate": {
      post: {
        operationId: "authenticateLoomCredential",
        summary: "Recognize a Loom project credential",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["credential"],
                properties: {
                  credential: {
                    type: "string",
                    pattern: "^loom_agent_[a-f0-9]{36}$",
                    description: "A Loom project credential supplied by the user.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The current caller and project grant.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["caller"],
                  properties: {
                    caller: {
                      type: "object",
                      required: ["authentication", "credential", "grant"],
                      properties: {
                        authentication: { type: "string", const: "bearer" },
                        credential: {
                          type: "object",
                          required: ["id", "label", "fingerprint", "createdAt"],
                          properties: {
                            id: { type: "string" },
                            label: { type: "string" },
                            fingerprint: { type: "string" },
                            createdAt: { type: "string", format: "date-time" },
                          },
                        },
                        grant: {
                          type: "object",
                          required: ["projectId", "capabilities"],
                          properties: {
                            projectId: { type: "string" },
                            capabilities: { type: "array", items: { type: "string" } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Malformed JSON request." },
          "401": { description: "Unknown, malformed, revoked, or unusable credential." },
          "410": { description: "The credential's project is unavailable." },
        },
      },
    },
  },
};
