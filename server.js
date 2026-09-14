const app = require("./src/app");
const { PORT, HOST } = require("./src/config");

app.listen(PORT, HOST, () => {
  console.log(`Backend escuchando en http://${HOST}:${PORT}`);
});
