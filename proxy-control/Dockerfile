FROM node:latest

# Install pre-requisites
RUN yarn global add serve

# Build app structure
COPY . /app-src
RUN rm -Rf /app-src/node_modules

# Yarn install
RUN cd /app-src && yarn install

# Build production ready package
RUN cd /app-src && npm run-script build && mv ./build /app && rm -Rf /app-src

# Copy serve.sh to workdir
COPY serve.sh /app

# Change to /app
WORKDIR /app

# Run watcher
CMD [ "./serve.sh" ]
