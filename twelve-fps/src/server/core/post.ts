// Import context from server package and reddit API from web server aggregate (which re-exports @devvit/reddit)
import { context } from '@devvit/server';

// Placeholder: reddit API export not available via current @devvit/server aggregation during build.
// Returning a mock object to keep downstream code functional without build failure.
export const createPost = async () => {
  const { subredditName } = context;
  if (!subredditName) throw new Error('subredditName is required');
  return { id: 'mock-post', subredditName } as any;
};
