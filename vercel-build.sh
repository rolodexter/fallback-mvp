#!/bin/bash
# Custom build script for Vercel deployment
echo "Running custom build script..."
chmod +x node_modules/.bin/vite
npm run build
