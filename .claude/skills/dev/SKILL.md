---
description: Start the dev server and verify it's running
---

1. Run `npm run dev` in the background
2. Wait 3 seconds
3. Verify the server is running by checking if port 3000 is listening: `lsof -i :3000 | head -5`
4. Report the local URL and status
