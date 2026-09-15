module.exports = async () => {
  // Let the test server exit itself; Windows process-tree killing is not always available.
  await fetch("http://127.0.0.1:4174/api/shutdown-test-server", { method: "POST" }).catch(() => {});
};
