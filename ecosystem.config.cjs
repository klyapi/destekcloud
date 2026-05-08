module.exports = {
  apps: [{
    name: "kl-destek",
    script: "src/server.js",
    instances: 1,
    autorestart: true,
    watch: false,
    env_production: {
      NODE_ENV: "production",
      PORT: 3000,
      HOST: "127.0.0.1"
    }
  }]
};
