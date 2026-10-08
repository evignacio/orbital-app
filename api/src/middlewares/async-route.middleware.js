// Express 4 does not catch a rejected handler. Logs the failure with the
// route's context, then hands it to the error handler, which answers 500
// without the internal message (and skips its own log, see `logged`).
function asyncRoute(failMessage, logFields, handler) {
  return (req, res, next) =>
    handler(req, res).catch(err => {
      req.log.error(failMessage, { ...logFields(req), err });
      err.logged = true;
      next(err);
    });
}

module.exports = asyncRoute;
