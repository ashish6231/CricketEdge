// Real-time disabled on serverless — plan updates reflect on next API call/refresh
function emitToUser(_userId, _event, _data) {}

module.exports = { emitToUser };
