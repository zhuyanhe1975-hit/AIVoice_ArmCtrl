import { createServer } from 'node:http';
import { validateControllerDecisionRequest } from './controllerDecisionSchema.ts';
import { createControllerDecision } from './openaiDecisionService.ts';
import { createVoiceAssistantReply } from './openaiVoiceResponseService.ts';
import { interpretVoiceCommand } from './openaiVoiceCommandService.ts';
import { createVisionDescription } from './visionDescriptionService.ts';
import { createVisionPlan } from './visionPlanningService.ts';
import { createVoiceTaskPlan } from './voiceTaskPlanningService.ts';

const port = Number(process.env.PORT ?? 3001);

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/decision/controller-blueprint') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const validation = validateControllerDecisionRequest(payload);

        if (!validation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: validation.reasons.join('; ') }));
          return;
        }

        const decision = await createControllerDecision(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(decision));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown server error',
          })
        );
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/voice/interpret') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}') as { command?: string };

        if (!payload.command || typeof payload.command !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'command is required' }));
          return;
        }

        const interpretation = await interpretVoiceCommand(payload.command);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(interpretation));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown server error',
          })
        );
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/voice/reply') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}') as {
          command?: string;
          interpretation?: Parameters<typeof createVoiceAssistantReply>[1];
        };

        if (!payload.command || typeof payload.command !== 'string' || !payload.interpretation) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'command and interpretation are required' }));
          return;
        }

        const reply = await createVoiceAssistantReply(
          payload.command,
          payload.interpretation
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown server error',
          })
        );
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/voice/task-plan') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}') as {
          command?: string;
          imageDataUrl?: string;
          sceneState?: Record<string, unknown>;
        };

        if (!payload.command || typeof payload.command !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'command is required' }));
          return;
        }

        const plan = await createVoiceTaskPlan({
          command: payload.command,
          imageDataUrl: payload.imageDataUrl,
          sceneState: payload.sceneState,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(plan));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown server error',
          })
        );
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/vision/plan') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}') as {
          command?: string;
          imageDataUrl?: string;
          sceneState?: Record<string, unknown>;
        };

        if (
          !payload.command ||
          typeof payload.command !== 'string' ||
          !payload.imageDataUrl ||
          typeof payload.imageDataUrl !== 'string'
        ) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'command and imageDataUrl are required' }));
          return;
        }

        const plan = await createVisionPlan({
          command: payload.command,
          imageDataUrl: payload.imageDataUrl,
          sceneState: payload.sceneState,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(plan));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown server error',
          })
        );
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/vision/describe') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}') as {
          command?: string;
          imageDataUrl?: string;
          sceneState?: Record<string, unknown>;
        };

        if (
          !payload.command ||
          typeof payload.command !== 'string' ||
          !payload.imageDataUrl ||
          typeof payload.imageDataUrl !== 'string'
        ) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'command and imageDataUrl are required' }));
          return;
        }

        const reply = await createVisionDescription({
          command: payload.command,
          imageDataUrl: payload.imageDataUrl,
          sceneState: payload.sceneState,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown server error',
          })
        );
      }
    });
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(port);
}

export { server };
