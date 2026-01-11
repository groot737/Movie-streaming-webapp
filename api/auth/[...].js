import { getAuthApp } from "../../server/authApp.js";

const app = getAuthApp();

export default function handler(req, res) {
  return app(req, res);
}
