FROM node:latest

# Build app structure
COPY . /app
RUN rm -Rf /app/node_modules

# Npm install
WORKDIR /app
RUN npm install

# Run watcher
CMD [ "node", "./server.js" ]
