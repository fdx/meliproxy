FROM node:latest

# Build app structure
RUN mkdir -p /logs
COPY ./app /logs/app
RUN rm -Rf /logs/app/node_modules

# Npm install
WORKDIR /logs/app
RUN npm install

# Run watcher
CMD [ "node", "./watch.js" ]
