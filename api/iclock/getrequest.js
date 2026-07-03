// api/iclock/getrequest.js
// The K50 periodically polls this URL asking "any commands for me?".
// We don't need to send it remote commands, so we just respond OK (no pending commands).
export default function handler(req, res) {
  res.status(200).send("OK");
}
