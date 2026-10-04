import { onRequestPost as __api_auth_js_onRequestPost } from "C:\\Users\\Adam\\Claude Work\\brickyprocky\\functions\\api\\auth.js"
import { onRequestGet as __api_codes_js_onRequestGet } from "C:\\Users\\Adam\\Claude Work\\brickyprocky\\functions\\api\\codes.js"
import { onRequestPost as __api_codes_js_onRequestPost } from "C:\\Users\\Adam\\Claude Work\\brickyprocky\\functions\\api\\codes.js"
import { onRequestPost as __api_logout_js_onRequestPost } from "C:\\Users\\Adam\\Claude Work\\brickyprocky\\functions\\api\\logout.js"
import { onRequestGet as __api_me_js_onRequestGet } from "C:\\Users\\Adam\\Claude Work\\brickyprocky\\functions\\api\\me.js"
import { onRequest as ___middleware_js_onRequest } from "C:\\Users\\Adam\\Claude Work\\brickyprocky\\functions\\_middleware.js"

export const routes = [
    {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_js_onRequestPost],
    },
  {
      routePath: "/api/codes",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_codes_js_onRequestGet],
    },
  {
      routePath: "/api/codes",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_codes_js_onRequestPost],
    },
  {
      routePath: "/api/logout",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_logout_js_onRequestPost],
    },
  {
      routePath: "/api/me",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_me_js_onRequestGet],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]