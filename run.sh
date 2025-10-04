#!/bin/bash

# Navigate to the app directory
cd src/frontend

# Install npm dependencies
npm install

# Build the project
npm run build

cd ../..

python3 src/main.py