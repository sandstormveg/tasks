#!/usr/bin/env node
// Research tool — bundled from sandstormveg/Journal_system (tools/research.mjs). inputs:0fa7b551f42af5d4
// Do not edit here; rebuild with `npm run bundle-cli` in the app repository.

// tools/research.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// vendor/js-yaml.js
function _e(e) {
  return typeof e > "u" || e === null;
}
function pn(e) {
  return typeof e == "object" && e !== null;
}
function tn(e) {
  return Array.isArray(e) ? e : _e(e) ? [] : [e];
}
function hn(e, n) {
  var i, l, r, u;
  if (n) for (u = Object.keys(n), i = 0, l = u.length; i < l; i += 1) r = u[i], e[r] = n[r];
  return e;
}
function dn(e, n) {
  var i = "", l;
  for (l = 0; l < n; l += 1) i += e;
  return i;
}
function sn(e) {
  return e === 0 && Number.NEGATIVE_INFINITY === 1 / e;
}
var xn = _e;
var mn = pn;
var gn = tn;
var An = dn;
var vn = sn;
var yn = hn;
var y = { isNothing: xn, isObject: mn, toArray: gn, repeat: An, isNegativeZero: vn, extend: yn };
function we(e, n) {
  var i = "", l = e.reason || "(unknown reason)";
  return e.mark ? (e.mark.name && (i += 'in "' + e.mark.name + '" '), i += "(" + (e.mark.line + 1) + ":" + (e.mark.column + 1) + ")", !n && e.mark.snippet && (i += `

` + e.mark.snippet), l + " " + i) : l;
}
function Y(e, n) {
  Error.call(this), this.name = "YAMLException", this.reason = e, this.mark = n, this.message = we(this, false), Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : this.stack = new Error().stack || "";
}
Y.prototype = Object.create(Error.prototype);
Y.prototype.constructor = Y;
Y.prototype.toString = function(n) {
  return this.name + ": " + we(this, n);
};
var w = Y;
function $(e, n, i, l, r) {
  var u = "", o = "", f = Math.floor(r / 2) - 1;
  return l - n > f && (u = " ... ", n = l - f + u.length), i - l > f && (o = " ...", i = l + f - o.length), { str: u + e.slice(n, i).replace(/\t/g, "\u2192") + o, pos: l - n + u.length };
}
function Q(e, n) {
  return y.repeat(" ", n - e.length) + e;
}
function Cn(e, n) {
  if (n = Object.create(n || null), !e.buffer) return null;
  n.maxLength || (n.maxLength = 79), typeof n.indent != "number" && (n.indent = 1), typeof n.linesBefore != "number" && (n.linesBefore = 3), typeof n.linesAfter != "number" && (n.linesAfter = 2);
  for (var i = /\r?\n|\r|\0/g, l = [0], r = [], u, o = -1; u = i.exec(e.buffer); ) r.push(u.index), l.push(u.index + u[0].length), e.position <= u.index && o < 0 && (o = l.length - 2);
  o < 0 && (o = l.length - 1);
  var f = "", c, a, t = Math.min(e.line + n.linesAfter, r.length).toString().length, p = n.maxLength - (n.indent + t + 3);
  for (c = 1; c <= n.linesBefore && !(o - c < 0); c++) a = $(e.buffer, l[o - c], r[o - c], e.position - (l[o] - l[o - c]), p), f = y.repeat(" ", n.indent) + Q((e.line - c + 1).toString(), t) + " | " + a.str + `
` + f;
  for (a = $(e.buffer, l[o], r[o], e.position, p), f += y.repeat(" ", n.indent) + Q((e.line + 1).toString(), t) + " | " + a.str + `
`, f += y.repeat("-", n.indent + t + 3 + a.pos) + `^
`, c = 1; c <= n.linesAfter && !(o + c >= r.length); c++) a = $(e.buffer, l[o + c], r[o + c], e.position - (l[o] - l[o + c]), p), f += y.repeat(" ", n.indent) + Q((e.line + c + 1).toString(), t) + " | " + a.str + `
`;
  return f.replace(/\n$/, "");
}
var _n = Cn;
var wn = ["kind", "multi", "resolve", "construct", "instanceOf", "predicate", "represent", "representName", "defaultStyle", "styleAliases"];
var En = ["scalar", "sequence", "mapping"];
function Sn(e) {
  var n = {};
  return e !== null && Object.keys(e).forEach(function(i) {
    e[i].forEach(function(l) {
      n[String(l)] = i;
    });
  }), n;
}
function Fn(e, n) {
  if (n = n || {}, Object.keys(n).forEach(function(i) {
    if (wn.indexOf(i) === -1) throw new w('Unknown option "' + i + '" is met in definition of "' + e + '" YAML type.');
  }), this.options = n, this.tag = e, this.kind = n.kind || null, this.resolve = n.resolve || function() {
    return true;
  }, this.construct = n.construct || function(i) {
    return i;
  }, this.instanceOf = n.instanceOf || null, this.predicate = n.predicate || null, this.represent = n.represent || null, this.representName = n.representName || null, this.defaultStyle = n.defaultStyle || null, this.multi = n.multi || false, this.styleAliases = Sn(n.styleAliases || null), En.indexOf(this.kind) === -1) throw new w('Unknown kind "' + this.kind + '" is specified for "' + e + '" YAML type.');
}
var C = Fn;
function fe(e, n) {
  var i = [];
  return e[n].forEach(function(l) {
    var r = i.length;
    i.forEach(function(u, o) {
      u.tag === l.tag && u.kind === l.kind && u.multi === l.multi && (r = o);
    }), i[r] = l;
  }), i;
}
function bn() {
  var e = { scalar: {}, sequence: {}, mapping: {}, fallback: {}, multi: { scalar: [], sequence: [], mapping: [], fallback: [] } }, n, i;
  function l(r) {
    r.multi ? (e.multi[r.kind].push(r), e.multi.fallback.push(r)) : e[r.kind][r.tag] = e.fallback[r.tag] = r;
  }
  for (n = 0, i = arguments.length; n < i; n += 1) arguments[n].forEach(l);
  return e;
}
function X(e) {
  return this.extend(e);
}
X.prototype.extend = function(n) {
  var i = [], l = [];
  if (n instanceof C) l.push(n);
  else if (Array.isArray(n)) l = l.concat(n);
  else if (n && (Array.isArray(n.implicit) || Array.isArray(n.explicit))) n.implicit && (i = i.concat(n.implicit)), n.explicit && (l = l.concat(n.explicit));
  else throw new w("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  i.forEach(function(u) {
    if (!(u instanceof C)) throw new w("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    if (u.loadKind && u.loadKind !== "scalar") throw new w("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    if (u.multi) throw new w("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
  }), l.forEach(function(u) {
    if (!(u instanceof C)) throw new w("Specified list of YAML types (or a single Type object) contains a non-Type object.");
  });
  var r = Object.create(X.prototype);
  return r.implicit = (this.implicit || []).concat(i), r.explicit = (this.explicit || []).concat(l), r.compiledImplicit = fe(r, "implicit"), r.compiledExplicit = fe(r, "explicit"), r.compiledTypeMap = bn(r.compiledImplicit, r.compiledExplicit), r;
};
var Ee = X;
var Se = new C("tag:yaml.org,2002:str", { kind: "scalar", construct: function(e) {
  return e !== null ? e : "";
} });
var Fe = new C("tag:yaml.org,2002:seq", { kind: "sequence", construct: function(e) {
  return e !== null ? e : [];
} });
var be = new C("tag:yaml.org,2002:map", { kind: "mapping", construct: function(e) {
  return e !== null ? e : {};
} });
var Te = new Ee({ explicit: [Se, Fe, be] });
function Tn(e) {
  if (e === null) return true;
  var n = e.length;
  return n === 1 && e === "~" || n === 4 && (e === "null" || e === "Null" || e === "NULL");
}
function On() {
  return null;
}
function In(e) {
  return e === null;
}
var Oe = new C("tag:yaml.org,2002:null", { kind: "scalar", resolve: Tn, construct: On, predicate: In, represent: { canonical: function() {
  return "~";
}, lowercase: function() {
  return "null";
}, uppercase: function() {
  return "NULL";
}, camelcase: function() {
  return "Null";
}, empty: function() {
  return "";
} }, defaultStyle: "lowercase" });
function Ln(e) {
  if (e === null) return false;
  var n = e.length;
  return n === 4 && (e === "true" || e === "True" || e === "TRUE") || n === 5 && (e === "false" || e === "False" || e === "FALSE");
}
function kn(e) {
  return e === "true" || e === "True" || e === "TRUE";
}
function Nn(e) {
  return Object.prototype.toString.call(e) === "[object Boolean]";
}
var Ie = new C("tag:yaml.org,2002:bool", { kind: "scalar", resolve: Ln, construct: kn, predicate: Nn, represent: { lowercase: function(e) {
  return e ? "true" : "false";
}, uppercase: function(e) {
  return e ? "TRUE" : "FALSE";
}, camelcase: function(e) {
  return e ? "True" : "False";
} }, defaultStyle: "lowercase" });
function Rn(e) {
  return 48 <= e && e <= 57 || 65 <= e && e <= 70 || 97 <= e && e <= 102;
}
function Dn(e) {
  return 48 <= e && e <= 55;
}
function Mn(e) {
  return 48 <= e && e <= 57;
}
function Yn(e) {
  if (e === null) return false;
  var n = e.length, i = 0, l = false, r;
  if (!n) return false;
  if (r = e[i], (r === "-" || r === "+") && (r = e[++i]), r === "0") {
    if (i + 1 === n) return true;
    if (r = e[++i], r === "b") {
      for (i++; i < n; i++) if (r = e[i], r !== "_") {
        if (r !== "0" && r !== "1") return false;
        l = true;
      }
      return l && r !== "_";
    }
    if (r === "x") {
      for (i++; i < n; i++) if (r = e[i], r !== "_") {
        if (!Rn(e.charCodeAt(i))) return false;
        l = true;
      }
      return l && r !== "_";
    }
    if (r === "o") {
      for (i++; i < n; i++) if (r = e[i], r !== "_") {
        if (!Dn(e.charCodeAt(i))) return false;
        l = true;
      }
      return l && r !== "_";
    }
  }
  if (r === "_") return false;
  for (; i < n; i++) if (r = e[i], r !== "_") {
    if (!Mn(e.charCodeAt(i))) return false;
    l = true;
  }
  return !(!l || r === "_");
}
function Bn(e) {
  var n = e, i = 1, l;
  if (n.indexOf("_") !== -1 && (n = n.replace(/_/g, "")), l = n[0], (l === "-" || l === "+") && (l === "-" && (i = -1), n = n.slice(1), l = n[0]), n === "0") return 0;
  if (l === "0") {
    if (n[1] === "b") return i * parseInt(n.slice(2), 2);
    if (n[1] === "x") return i * parseInt(n.slice(2), 16);
    if (n[1] === "o") return i * parseInt(n.slice(2), 8);
  }
  return i * parseInt(n, 10);
}
function Pn(e) {
  return Object.prototype.toString.call(e) === "[object Number]" && e % 1 === 0 && !y.isNegativeZero(e);
}
var Le = new C("tag:yaml.org,2002:int", { kind: "scalar", resolve: Yn, construct: Bn, predicate: Pn, represent: { binary: function(e) {
  return e >= 0 ? "0b" + e.toString(2) : "-0b" + e.toString(2).slice(1);
}, octal: function(e) {
  return e >= 0 ? "0o" + e.toString(8) : "-0o" + e.toString(8).slice(1);
}, decimal: function(e) {
  return e.toString(10);
}, hexadecimal: function(e) {
  return e >= 0 ? "0x" + e.toString(16).toUpperCase() : "-0x" + e.toString(16).toUpperCase().slice(1);
} }, defaultStyle: "decimal", styleAliases: { binary: [2, "bin"], octal: [8, "oct"], decimal: [10, "dec"], hexadecimal: [16, "hex"] } });
var Hn = new RegExp("^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function jn(e) {
  return !(e === null || !Hn.test(e) || e[e.length - 1] === "_");
}
function Un(e) {
  var n, i;
  return n = e.replace(/_/g, "").toLowerCase(), i = n[0] === "-" ? -1 : 1, "+-".indexOf(n[0]) >= 0 && (n = n.slice(1)), n === ".inf" ? i === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY : n === ".nan" ? NaN : i * parseFloat(n, 10);
}
var Kn = /^[-+]?[0-9]+e/;
function qn(e, n) {
  var i;
  if (isNaN(e)) switch (n) {
    case "lowercase":
      return ".nan";
    case "uppercase":
      return ".NAN";
    case "camelcase":
      return ".NaN";
  }
  else if (Number.POSITIVE_INFINITY === e) switch (n) {
    case "lowercase":
      return ".inf";
    case "uppercase":
      return ".INF";
    case "camelcase":
      return ".Inf";
  }
  else if (Number.NEGATIVE_INFINITY === e) switch (n) {
    case "lowercase":
      return "-.inf";
    case "uppercase":
      return "-.INF";
    case "camelcase":
      return "-.Inf";
  }
  else if (y.isNegativeZero(e)) return "-0.0";
  return i = e.toString(10), Kn.test(i) ? i.replace("e", ".e") : i;
}
function Gn(e) {
  return Object.prototype.toString.call(e) === "[object Number]" && (e % 1 !== 0 || y.isNegativeZero(e));
}
var ke = new C("tag:yaml.org,2002:float", { kind: "scalar", resolve: jn, construct: Un, predicate: Gn, represent: qn, defaultStyle: "lowercase" });
var Ne = Te.extend({ implicit: [Oe, Ie, Le, ke] });
var Re = Ne;
var De = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
var Me = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
function Wn(e) {
  return e === null ? false : De.exec(e) !== null || Me.exec(e) !== null;
}
function $n(e) {
  var n, i, l, r, u, o, f, c = 0, a = null, t, p, d;
  if (n = De.exec(e), n === null && (n = Me.exec(e)), n === null) throw new Error("Date resolve error");
  if (i = +n[1], l = +n[2] - 1, r = +n[3], !n[4]) return new Date(Date.UTC(i, l, r));
  if (u = +n[4], o = +n[5], f = +n[6], n[7]) {
    for (c = n[7].slice(0, 3); c.length < 3; ) c += "0";
    c = +c;
  }
  return n[9] && (t = +n[10], p = +(n[11] || 0), a = (t * 60 + p) * 6e4, n[9] === "-" && (a = -a)), d = new Date(Date.UTC(i, l, r, u, o, f, c)), a && d.setTime(d.getTime() - a), d;
}
function Qn(e) {
  return e.toISOString();
}
var Ye = new C("tag:yaml.org,2002:timestamp", { kind: "scalar", resolve: Wn, construct: $n, instanceOf: Date, represent: Qn });
function Vn(e) {
  return e === "<<" || e === null;
}
var Be = new C("tag:yaml.org,2002:merge", { kind: "scalar", resolve: Vn });
var ne = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=
\r`;
function Xn(e) {
  if (e === null) return false;
  var n, i, l = 0, r = e.length, u = ne;
  for (i = 0; i < r; i++) if (n = u.indexOf(e.charAt(i)), !(n > 64)) {
    if (n < 0) return false;
    l += 6;
  }
  return l % 8 === 0;
}
function Zn(e) {
  var n, i, l = e.replace(/[\r\n=]/g, ""), r = l.length, u = ne, o = 0, f = [];
  for (n = 0; n < r; n++) n % 4 === 0 && n && (f.push(o >> 16 & 255), f.push(o >> 8 & 255), f.push(o & 255)), o = o << 6 | u.indexOf(l.charAt(n));
  return i = r % 4 * 6, i === 0 ? (f.push(o >> 16 & 255), f.push(o >> 8 & 255), f.push(o & 255)) : i === 18 ? (f.push(o >> 10 & 255), f.push(o >> 2 & 255)) : i === 12 && f.push(o >> 4 & 255), new Uint8Array(f);
}
function zn(e) {
  var n = "", i = 0, l, r, u = e.length, o = ne;
  for (l = 0; l < u; l++) l % 3 === 0 && l && (n += o[i >> 18 & 63], n += o[i >> 12 & 63], n += o[i >> 6 & 63], n += o[i & 63]), i = (i << 8) + e[l];
  return r = u % 3, r === 0 ? (n += o[i >> 18 & 63], n += o[i >> 12 & 63], n += o[i >> 6 & 63], n += o[i & 63]) : r === 2 ? (n += o[i >> 10 & 63], n += o[i >> 4 & 63], n += o[i << 2 & 63], n += o[64]) : r === 1 && (n += o[i >> 2 & 63], n += o[i << 4 & 63], n += o[64], n += o[64]), n;
}
function Jn(e) {
  return Object.prototype.toString.call(e) === "[object Uint8Array]";
}
var Pe = new C("tag:yaml.org,2002:binary", { kind: "scalar", resolve: Xn, construct: Zn, predicate: Jn, represent: zn });
var ei = Object.prototype.hasOwnProperty;
var ni = Object.prototype.toString;
function ii(e) {
  if (e === null) return true;
  var n = [], i, l, r, u, o, f = e;
  for (i = 0, l = f.length; i < l; i += 1) {
    if (r = f[i], o = false, ni.call(r) !== "[object Object]") return false;
    for (u in r) if (ei.call(r, u)) if (!o) o = true;
    else return false;
    if (!o) return false;
    if (n.indexOf(u) === -1) n.push(u);
    else return false;
  }
  return true;
}
function ri(e) {
  return e !== null ? e : [];
}
var He = new C("tag:yaml.org,2002:omap", { kind: "sequence", resolve: ii, construct: ri });
var li = Object.prototype.toString;
function oi(e) {
  if (e === null) return true;
  var n, i, l, r, u, o = e;
  for (u = new Array(o.length), n = 0, i = o.length; n < i; n += 1) {
    if (l = o[n], li.call(l) !== "[object Object]" || (r = Object.keys(l), r.length !== 1)) return false;
    u[n] = [r[0], l[r[0]]];
  }
  return true;
}
function ui(e) {
  if (e === null) return [];
  var n, i, l, r, u, o = e;
  for (u = new Array(o.length), n = 0, i = o.length; n < i; n += 1) l = o[n], r = Object.keys(l), u[n] = [r[0], l[r[0]]];
  return u;
}
var je = new C("tag:yaml.org,2002:pairs", { kind: "sequence", resolve: oi, construct: ui });
var fi = Object.prototype.hasOwnProperty;
function ci(e) {
  if (e === null) return true;
  var n, i = e;
  for (n in i) if (fi.call(i, n) && i[n] !== null) return false;
  return true;
}
function ai(e) {
  return e !== null ? e : {};
}
var Ue = new C("tag:yaml.org,2002:set", { kind: "mapping", resolve: ci, construct: ai });
var ie = Re.extend({ implicit: [Ye, Be], explicit: [Pe, He, je, Ue] });
var O = Object.prototype.hasOwnProperty;
var j = 1;
var Ke = 2;
var qe = 3;
var U = 4;
var V = 1;
var pi = 2;
var ce = 3;
var ti = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var hi = /[\x85\u2028\u2029]/;
var di = /[,\[\]\{\}]/;
var Ge = /^(?:!|!!|![a-z\-]+!)$/i;
var We = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function ae(e) {
  return Object.prototype.toString.call(e);
}
function F(e) {
  return e === 10 || e === 13;
}
function L(e) {
  return e === 9 || e === 32;
}
function E(e) {
  return e === 9 || e === 32 || e === 10 || e === 13;
}
function N(e) {
  return e === 44 || e === 91 || e === 93 || e === 123 || e === 125;
}
function si(e) {
  var n;
  return 48 <= e && e <= 57 ? e - 48 : (n = e | 32, 97 <= n && n <= 102 ? n - 97 + 10 : -1);
}
function xi(e) {
  return e === 120 ? 2 : e === 117 ? 4 : e === 85 ? 8 : 0;
}
function mi(e) {
  return 48 <= e && e <= 57 ? e - 48 : -1;
}
function pe(e) {
  return e === 48 ? "\0" : e === 97 ? "\x07" : e === 98 ? "\b" : e === 116 || e === 9 ? "	" : e === 110 ? `
` : e === 118 ? "\v" : e === 102 ? "\f" : e === 114 ? "\r" : e === 101 ? "\x1B" : e === 32 ? " " : e === 34 ? '"' : e === 47 ? "/" : e === 92 ? "\\" : e === 78 ? "\x85" : e === 95 ? "\xA0" : e === 76 ? "\u2028" : e === 80 ? "\u2029" : "";
}
function gi(e) {
  return e <= 65535 ? String.fromCharCode(e) : String.fromCharCode((e - 65536 >> 10) + 55296, (e - 65536 & 1023) + 56320);
}
var $e = new Array(256);
var Qe = new Array(256);
for (I = 0; I < 256; I++) $e[I] = pe(I) ? 1 : 0, Qe[I] = pe(I);
var I;
function Ai(e, n) {
  this.input = e, this.filename = n.filename || null, this.schema = n.schema || ie, this.onWarning = n.onWarning || null, this.legacy = n.legacy || false, this.json = n.json || false, this.listener = n.listener || null, this.implicitTypes = this.schema.compiledImplicit, this.typeMap = this.schema.compiledTypeMap, this.length = e.length, this.position = 0, this.line = 0, this.lineStart = 0, this.lineIndent = 0, this.firstTabInLine = -1, this.documents = [];
}
function Ve(e, n) {
  var i = { name: e.filename, buffer: e.input.slice(0, -1), position: e.position, line: e.line, column: e.position - e.lineStart };
  return i.snippet = _n(i), new w(n, i);
}
function h(e, n) {
  throw Ve(e, n);
}
function K(e, n) {
  e.onWarning && e.onWarning.call(null, Ve(e, n));
}
var te = { YAML: function(n, i, l) {
  var r, u, o;
  n.version !== null && h(n, "duplication of %YAML directive"), l.length !== 1 && h(n, "YAML directive accepts exactly one argument"), r = /^([0-9]+)\.([0-9]+)$/.exec(l[0]), r === null && h(n, "ill-formed argument of the YAML directive"), u = parseInt(r[1], 10), o = parseInt(r[2], 10), u !== 1 && h(n, "unacceptable YAML version of the document"), n.version = l[0], n.checkLineBreaks = o < 2, o !== 1 && o !== 2 && K(n, "unsupported YAML version of the document");
}, TAG: function(n, i, l) {
  var r, u;
  l.length !== 2 && h(n, "TAG directive accepts exactly two arguments"), r = l[0], u = l[1], Ge.test(r) || h(n, "ill-formed tag handle (first argument) of the TAG directive"), O.call(n.tagMap, r) && h(n, 'there is a previously declared suffix for "' + r + '" tag handle'), We.test(u) || h(n, "ill-formed tag prefix (second argument) of the TAG directive");
  try {
    u = decodeURIComponent(u);
  } catch {
    h(n, "tag prefix is malformed: " + u);
  }
  n.tagMap[r] = u;
} };
function T(e, n, i, l) {
  var r, u, o, f;
  if (n < i) {
    if (f = e.input.slice(n, i), l) for (r = 0, u = f.length; r < u; r += 1) o = f.charCodeAt(r), o === 9 || 32 <= o && o <= 1114111 || h(e, "expected valid JSON character");
    else ti.test(f) && h(e, "the stream contains non-printable characters");
    e.result += f;
  }
}
function he(e, n, i, l) {
  var r, u, o, f;
  for (y.isObject(i) || h(e, "cannot merge mappings; the provided source object is unacceptable"), r = Object.keys(i), o = 0, f = r.length; o < f; o += 1) u = r[o], O.call(n, u) || (n[u] = i[u], l[u] = true);
}
function R(e, n, i, l, r, u, o, f, c) {
  var a, t;
  if (Array.isArray(r)) for (r = Array.prototype.slice.call(r), a = 0, t = r.length; a < t; a += 1) Array.isArray(r[a]) && h(e, "nested arrays are not supported inside keys"), typeof r == "object" && ae(r[a]) === "[object Object]" && (r[a] = "[object Object]");
  if (typeof r == "object" && ae(r) === "[object Object]" && (r = "[object Object]"), r = String(r), n === null && (n = {}), l === "tag:yaml.org,2002:merge") if (Array.isArray(u)) for (a = 0, t = u.length; a < t; a += 1) he(e, n, u[a], i);
  else he(e, n, u, i);
  else !e.json && !O.call(i, r) && O.call(n, r) && (e.line = o || e.line, e.lineStart = f || e.lineStart, e.position = c || e.position, h(e, "duplicated mapping key")), r === "__proto__" ? Object.defineProperty(n, r, { configurable: true, enumerable: true, writable: true, value: u }) : n[r] = u, delete i[r];
  return n;
}
function re(e) {
  var n;
  n = e.input.charCodeAt(e.position), n === 10 ? e.position++ : n === 13 ? (e.position++, e.input.charCodeAt(e.position) === 10 && e.position++) : h(e, "a line break is expected"), e.line += 1, e.lineStart = e.position, e.firstTabInLine = -1;
}
function v(e, n, i) {
  for (var l = 0, r = e.input.charCodeAt(e.position); r !== 0; ) {
    for (; L(r); ) r === 9 && e.firstTabInLine === -1 && (e.firstTabInLine = e.position), r = e.input.charCodeAt(++e.position);
    if (n && r === 35) do
      r = e.input.charCodeAt(++e.position);
    while (r !== 10 && r !== 13 && r !== 0);
    if (F(r)) for (re(e), r = e.input.charCodeAt(e.position), l++, e.lineIndent = 0; r === 32; ) e.lineIndent++, r = e.input.charCodeAt(++e.position);
    else break;
  }
  return i !== -1 && l !== 0 && e.lineIndent < i && K(e, "deficient indentation"), l;
}
function W(e) {
  var n = e.position, i;
  return i = e.input.charCodeAt(n), !!((i === 45 || i === 46) && i === e.input.charCodeAt(n + 1) && i === e.input.charCodeAt(n + 2) && (n += 3, i = e.input.charCodeAt(n), i === 0 || E(i)));
}
function le(e, n) {
  n === 1 ? e.result += " " : n > 1 && (e.result += y.repeat(`
`, n - 1));
}
function vi(e, n, i) {
  var l, r, u, o, f, c, a, t, p = e.kind, d = e.result, s;
  if (s = e.input.charCodeAt(e.position), E(s) || N(s) || s === 35 || s === 38 || s === 42 || s === 33 || s === 124 || s === 62 || s === 39 || s === 34 || s === 37 || s === 64 || s === 96 || (s === 63 || s === 45) && (r = e.input.charCodeAt(e.position + 1), E(r) || i && N(r))) return false;
  for (e.kind = "scalar", e.result = "", u = o = e.position, f = false; s !== 0; ) {
    if (s === 58) {
      if (r = e.input.charCodeAt(e.position + 1), E(r) || i && N(r)) break;
    } else if (s === 35) {
      if (l = e.input.charCodeAt(e.position - 1), E(l)) break;
    } else {
      if (e.position === e.lineStart && W(e) || i && N(s)) break;
      if (F(s)) if (c = e.line, a = e.lineStart, t = e.lineIndent, v(e, false, -1), e.lineIndent >= n) {
        f = true, s = e.input.charCodeAt(e.position);
        continue;
      } else {
        e.position = o, e.line = c, e.lineStart = a, e.lineIndent = t;
        break;
      }
    }
    f && (T(e, u, o, false), le(e, e.line - c), u = o = e.position, f = false), L(s) || (o = e.position + 1), s = e.input.charCodeAt(++e.position);
  }
  return T(e, u, o, false), e.result ? true : (e.kind = p, e.result = d, false);
}
function yi(e, n) {
  var i, l, r;
  if (i = e.input.charCodeAt(e.position), i !== 39) return false;
  for (e.kind = "scalar", e.result = "", e.position++, l = r = e.position; (i = e.input.charCodeAt(e.position)) !== 0; ) if (i === 39) if (T(e, l, e.position, true), i = e.input.charCodeAt(++e.position), i === 39) l = e.position, e.position++, r = e.position;
  else return true;
  else F(i) ? (T(e, l, r, true), le(e, v(e, false, n)), l = r = e.position) : e.position === e.lineStart && W(e) ? h(e, "unexpected end of the document within a single quoted scalar") : (e.position++, r = e.position);
  h(e, "unexpected end of the stream within a single quoted scalar");
}
function Ci(e, n) {
  var i, l, r, u, o, f;
  if (f = e.input.charCodeAt(e.position), f !== 34) return false;
  for (e.kind = "scalar", e.result = "", e.position++, i = l = e.position; (f = e.input.charCodeAt(e.position)) !== 0; ) {
    if (f === 34) return T(e, i, e.position, true), e.position++, true;
    if (f === 92) {
      if (T(e, i, e.position, true), f = e.input.charCodeAt(++e.position), F(f)) v(e, false, n);
      else if (f < 256 && $e[f]) e.result += Qe[f], e.position++;
      else if ((o = xi(f)) > 0) {
        for (r = o, u = 0; r > 0; r--) f = e.input.charCodeAt(++e.position), (o = si(f)) >= 0 ? u = (u << 4) + o : h(e, "expected hexadecimal character");
        e.result += gi(u), e.position++;
      } else h(e, "unknown escape sequence");
      i = l = e.position;
    } else F(f) ? (T(e, i, l, true), le(e, v(e, false, n)), i = l = e.position) : e.position === e.lineStart && W(e) ? h(e, "unexpected end of the document within a double quoted scalar") : (e.position++, l = e.position);
  }
  h(e, "unexpected end of the stream within a double quoted scalar");
}
function _i(e, n) {
  var i = true, l, r, u, o = e.tag, f, c = e.anchor, a, t, p, d, s, x = /* @__PURE__ */ Object.create(null), g, A, S, m;
  if (m = e.input.charCodeAt(e.position), m === 91) t = 93, s = false, f = [];
  else if (m === 123) t = 125, s = true, f = {};
  else return false;
  for (e.anchor !== null && (e.anchorMap[e.anchor] = f), m = e.input.charCodeAt(++e.position); m !== 0; ) {
    if (v(e, true, n), m = e.input.charCodeAt(e.position), m === t) return e.position++, e.tag = o, e.anchor = c, e.kind = s ? "mapping" : "sequence", e.result = f, true;
    i ? m === 44 && h(e, "expected the node content, but found ','") : h(e, "missed comma between flow collection entries"), A = g = S = null, p = d = false, m === 63 && (a = e.input.charCodeAt(e.position + 1), E(a) && (p = d = true, e.position++, v(e, true, n))), l = e.line, r = e.lineStart, u = e.position, D(e, n, j, false, true), A = e.tag, g = e.result, v(e, true, n), m = e.input.charCodeAt(e.position), (d || e.line === l) && m === 58 && (p = true, m = e.input.charCodeAt(++e.position), v(e, true, n), D(e, n, j, false, true), S = e.result), s ? R(e, f, x, A, g, S, l, r, u) : p ? f.push(R(e, null, x, A, g, S, l, r, u)) : f.push(g), v(e, true, n), m = e.input.charCodeAt(e.position), m === 44 ? (i = true, m = e.input.charCodeAt(++e.position)) : i = false;
  }
  h(e, "unexpected end of the stream within a flow collection");
}
function wi(e, n) {
  var i, l, r = V, u = false, o = false, f = n, c = 0, a = false, t, p;
  if (p = e.input.charCodeAt(e.position), p === 124) l = false;
  else if (p === 62) l = true;
  else return false;
  for (e.kind = "scalar", e.result = ""; p !== 0; ) if (p = e.input.charCodeAt(++e.position), p === 43 || p === 45) V === r ? r = p === 43 ? ce : pi : h(e, "repeat of a chomping mode identifier");
  else if ((t = mi(p)) >= 0) t === 0 ? h(e, "bad explicit indentation width of a block scalar; it cannot be less than one") : o ? h(e, "repeat of an indentation width identifier") : (f = n + t - 1, o = true);
  else break;
  if (L(p)) {
    do
      p = e.input.charCodeAt(++e.position);
    while (L(p));
    if (p === 35) do
      p = e.input.charCodeAt(++e.position);
    while (!F(p) && p !== 0);
  }
  for (; p !== 0; ) {
    for (re(e), e.lineIndent = 0, p = e.input.charCodeAt(e.position); (!o || e.lineIndent < f) && p === 32; ) e.lineIndent++, p = e.input.charCodeAt(++e.position);
    if (!o && e.lineIndent > f && (f = e.lineIndent), F(p)) {
      c++;
      continue;
    }
    if (e.lineIndent < f) {
      r === ce ? e.result += y.repeat(`
`, u ? 1 + c : c) : r === V && u && (e.result += `
`);
      break;
    }
    for (l ? L(p) ? (a = true, e.result += y.repeat(`
`, u ? 1 + c : c)) : a ? (a = false, e.result += y.repeat(`
`, c + 1)) : c === 0 ? u && (e.result += " ") : e.result += y.repeat(`
`, c) : e.result += y.repeat(`
`, u ? 1 + c : c), u = true, o = true, c = 0, i = e.position; !F(p) && p !== 0; ) p = e.input.charCodeAt(++e.position);
    T(e, i, e.position, false);
  }
  return true;
}
function de(e, n) {
  var i, l = e.tag, r = e.anchor, u = [], o, f = false, c;
  if (e.firstTabInLine !== -1) return false;
  for (e.anchor !== null && (e.anchorMap[e.anchor] = u), c = e.input.charCodeAt(e.position); c !== 0 && (e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, h(e, "tab characters must not be used in indentation")), !(c !== 45 || (o = e.input.charCodeAt(e.position + 1), !E(o)))); ) {
    if (f = true, e.position++, v(e, true, -1) && e.lineIndent <= n) {
      u.push(null), c = e.input.charCodeAt(e.position);
      continue;
    }
    if (i = e.line, D(e, n, qe, false, true), u.push(e.result), v(e, true, -1), c = e.input.charCodeAt(e.position), (e.line === i || e.lineIndent > n) && c !== 0) h(e, "bad indentation of a sequence entry");
    else if (e.lineIndent < n) break;
  }
  return f ? (e.tag = l, e.anchor = r, e.kind = "sequence", e.result = u, true) : false;
}
function Ei(e, n, i) {
  var l, r, u, o, f, c, a = e.tag, t = e.anchor, p = {}, d = /* @__PURE__ */ Object.create(null), s = null, x = null, g = null, A = false, S = false, m;
  if (e.firstTabInLine !== -1) return false;
  for (e.anchor !== null && (e.anchorMap[e.anchor] = p), m = e.input.charCodeAt(e.position); m !== 0; ) {
    if (!A && e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, h(e, "tab characters must not be used in indentation")), l = e.input.charCodeAt(e.position + 1), u = e.line, (m === 63 || m === 58) && E(l)) m === 63 ? (A && (R(e, p, d, s, x, null, o, f, c), s = x = g = null), S = true, A = true, r = true) : A ? (A = false, r = true) : h(e, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"), e.position += 1, m = l;
    else {
      if (o = e.line, f = e.lineStart, c = e.position, !D(e, i, Ke, false, true)) break;
      if (e.line === u) {
        for (m = e.input.charCodeAt(e.position); L(m); ) m = e.input.charCodeAt(++e.position);
        if (m === 58) m = e.input.charCodeAt(++e.position), E(m) || h(e, "a whitespace character is expected after the key-value separator within a block mapping"), A && (R(e, p, d, s, x, null, o, f, c), s = x = g = null), S = true, A = false, r = false, s = e.tag, x = e.result;
        else if (S) h(e, "can not read an implicit mapping pair; a colon is missed");
        else return e.tag = a, e.anchor = t, true;
      } else if (S) h(e, "can not read a block mapping entry; a multiline key may not be an implicit key");
      else return e.tag = a, e.anchor = t, true;
    }
    if ((e.line === u || e.lineIndent > n) && (A && (o = e.line, f = e.lineStart, c = e.position), D(e, n, U, true, r) && (A ? x = e.result : g = e.result), A || (R(e, p, d, s, x, g, o, f, c), s = x = g = null), v(e, true, -1), m = e.input.charCodeAt(e.position)), (e.line === u || e.lineIndent > n) && m !== 0) h(e, "bad indentation of a mapping entry");
    else if (e.lineIndent < n) break;
  }
  return A && R(e, p, d, s, x, null, o, f, c), S && (e.tag = a, e.anchor = t, e.kind = "mapping", e.result = p), S;
}
function Si(e) {
  var n, i = false, l = false, r, u, o;
  if (o = e.input.charCodeAt(e.position), o !== 33) return false;
  if (e.tag !== null && h(e, "duplication of a tag property"), o = e.input.charCodeAt(++e.position), o === 60 ? (i = true, o = e.input.charCodeAt(++e.position)) : o === 33 ? (l = true, r = "!!", o = e.input.charCodeAt(++e.position)) : r = "!", n = e.position, i) {
    do
      o = e.input.charCodeAt(++e.position);
    while (o !== 0 && o !== 62);
    e.position < e.length ? (u = e.input.slice(n, e.position), o = e.input.charCodeAt(++e.position)) : h(e, "unexpected end of the stream within a verbatim tag");
  } else {
    for (; o !== 0 && !E(o); ) o === 33 && (l ? h(e, "tag suffix cannot contain exclamation marks") : (r = e.input.slice(n - 1, e.position + 1), Ge.test(r) || h(e, "named tag handle cannot contain such characters"), l = true, n = e.position + 1)), o = e.input.charCodeAt(++e.position);
    u = e.input.slice(n, e.position), di.test(u) && h(e, "tag suffix cannot contain flow indicator characters");
  }
  u && !We.test(u) && h(e, "tag name cannot contain such characters: " + u);
  try {
    u = decodeURIComponent(u);
  } catch {
    h(e, "tag name is malformed: " + u);
  }
  return i ? e.tag = u : O.call(e.tagMap, r) ? e.tag = e.tagMap[r] + u : r === "!" ? e.tag = "!" + u : r === "!!" ? e.tag = "tag:yaml.org,2002:" + u : h(e, 'undeclared tag handle "' + r + '"'), true;
}
function Fi(e) {
  var n, i;
  if (i = e.input.charCodeAt(e.position), i !== 38) return false;
  for (e.anchor !== null && h(e, "duplication of an anchor property"), i = e.input.charCodeAt(++e.position), n = e.position; i !== 0 && !E(i) && !N(i); ) i = e.input.charCodeAt(++e.position);
  return e.position === n && h(e, "name of an anchor node must contain at least one character"), e.anchor = e.input.slice(n, e.position), true;
}
function bi(e) {
  var n, i, l;
  if (l = e.input.charCodeAt(e.position), l !== 42) return false;
  for (l = e.input.charCodeAt(++e.position), n = e.position; l !== 0 && !E(l) && !N(l); ) l = e.input.charCodeAt(++e.position);
  return e.position === n && h(e, "name of an alias node must contain at least one character"), i = e.input.slice(n, e.position), O.call(e.anchorMap, i) || h(e, 'unidentified alias "' + i + '"'), e.result = e.anchorMap[i], v(e, true, -1), true;
}
function D(e, n, i, l, r) {
  var u, o, f, c = 1, a = false, t = false, p, d, s, x, g, A;
  if (e.listener !== null && e.listener("open", e), e.tag = null, e.anchor = null, e.kind = null, e.result = null, u = o = f = U === i || qe === i, l && v(e, true, -1) && (a = true, e.lineIndent > n ? c = 1 : e.lineIndent === n ? c = 0 : e.lineIndent < n && (c = -1)), c === 1) for (; Si(e) || Fi(e); ) v(e, true, -1) ? (a = true, f = u, e.lineIndent > n ? c = 1 : e.lineIndent === n ? c = 0 : e.lineIndent < n && (c = -1)) : f = false;
  if (f && (f = a || r), (c === 1 || U === i) && (j === i || Ke === i ? g = n : g = n + 1, A = e.position - e.lineStart, c === 1 ? f && (de(e, A) || Ei(e, A, g)) || _i(e, g) ? t = true : (o && wi(e, g) || yi(e, g) || Ci(e, g) ? t = true : bi(e) ? (t = true, (e.tag !== null || e.anchor !== null) && h(e, "alias node should not have any properties")) : vi(e, g, j === i) && (t = true, e.tag === null && (e.tag = "?")), e.anchor !== null && (e.anchorMap[e.anchor] = e.result)) : c === 0 && (t = f && de(e, A))), e.tag === null) e.anchor !== null && (e.anchorMap[e.anchor] = e.result);
  else if (e.tag === "?") {
    for (e.result !== null && e.kind !== "scalar" && h(e, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + e.kind + '"'), p = 0, d = e.implicitTypes.length; p < d; p += 1) if (x = e.implicitTypes[p], x.resolve(e.result)) {
      e.result = x.construct(e.result), e.tag = x.tag, e.anchor !== null && (e.anchorMap[e.anchor] = e.result);
      break;
    }
  } else if (e.tag !== "!") {
    if (O.call(e.typeMap[e.kind || "fallback"], e.tag)) x = e.typeMap[e.kind || "fallback"][e.tag];
    else for (x = null, s = e.typeMap.multi[e.kind || "fallback"], p = 0, d = s.length; p < d; p += 1) if (e.tag.slice(0, s[p].tag.length) === s[p].tag) {
      x = s[p];
      break;
    }
    x || h(e, "unknown tag !<" + e.tag + ">"), e.result !== null && x.kind !== e.kind && h(e, "unacceptable node kind for !<" + e.tag + '> tag; it should be "' + x.kind + '", not "' + e.kind + '"'), x.resolve(e.result, e.tag) ? (e.result = x.construct(e.result, e.tag), e.anchor !== null && (e.anchorMap[e.anchor] = e.result)) : h(e, "cannot resolve a node with !<" + e.tag + "> explicit tag");
  }
  return e.listener !== null && e.listener("close", e), e.tag !== null || e.anchor !== null || t;
}
function Ti(e) {
  var n = e.position, i, l, r, u = false, o;
  for (e.version = null, e.checkLineBreaks = e.legacy, e.tagMap = /* @__PURE__ */ Object.create(null), e.anchorMap = /* @__PURE__ */ Object.create(null); (o = e.input.charCodeAt(e.position)) !== 0 && (v(e, true, -1), o = e.input.charCodeAt(e.position), !(e.lineIndent > 0 || o !== 37)); ) {
    for (u = true, o = e.input.charCodeAt(++e.position), i = e.position; o !== 0 && !E(o); ) o = e.input.charCodeAt(++e.position);
    for (l = e.input.slice(i, e.position), r = [], l.length < 1 && h(e, "directive name must not be less than one character in length"); o !== 0; ) {
      for (; L(o); ) o = e.input.charCodeAt(++e.position);
      if (o === 35) {
        do
          o = e.input.charCodeAt(++e.position);
        while (o !== 0 && !F(o));
        break;
      }
      if (F(o)) break;
      for (i = e.position; o !== 0 && !E(o); ) o = e.input.charCodeAt(++e.position);
      r.push(e.input.slice(i, e.position));
    }
    o !== 0 && re(e), O.call(te, l) ? te[l](e, l, r) : K(e, 'unknown document directive "' + l + '"');
  }
  if (v(e, true, -1), e.lineIndent === 0 && e.input.charCodeAt(e.position) === 45 && e.input.charCodeAt(e.position + 1) === 45 && e.input.charCodeAt(e.position + 2) === 45 ? (e.position += 3, v(e, true, -1)) : u && h(e, "directives end mark is expected"), D(e, e.lineIndent - 1, U, false, true), v(e, true, -1), e.checkLineBreaks && hi.test(e.input.slice(n, e.position)) && K(e, "non-ASCII line breaks are interpreted as content"), e.documents.push(e.result), e.position === e.lineStart && W(e)) {
    e.input.charCodeAt(e.position) === 46 && (e.position += 3, v(e, true, -1));
    return;
  }
  if (e.position < e.length - 1) h(e, "end of the stream or a document separator is expected");
  else return;
}
function Xe(e, n) {
  e = String(e), n = n || {}, e.length !== 0 && (e.charCodeAt(e.length - 1) !== 10 && e.charCodeAt(e.length - 1) !== 13 && (e += `
`), e.charCodeAt(0) === 65279 && (e = e.slice(1)));
  var i = new Ai(e, n), l = e.indexOf("\0");
  for (l !== -1 && (i.position = l, h(i, "null byte is not allowed in input")), i.input += "\0"; i.input.charCodeAt(i.position) === 32; ) i.lineIndent += 1, i.position += 1;
  for (; i.position < i.length - 1; ) Ti(i);
  return i.documents;
}
function Oi(e, n, i) {
  n !== null && typeof n == "object" && typeof i > "u" && (i = n, n = null);
  var l = Xe(e, i);
  if (typeof n != "function") return l;
  for (var r = 0, u = l.length; r < u; r += 1) n(l[r]);
}
function Ii(e, n) {
  var i = Xe(e, n);
  if (i.length !== 0) {
    if (i.length === 1) return i[0];
    throw new w("expected a single document in the stream, but found more");
  }
}
var Li = Oi;
var ki = Ii;
var Ze = { loadAll: Li, load: ki };
var ze = Object.prototype.toString;
var Je = Object.prototype.hasOwnProperty;
var oe = 65279;
var Ni = 9;
var B = 10;
var Ri = 13;
var Di = 32;
var Mi = 33;
var Yi = 34;
var Z = 35;
var Bi = 37;
var Pi = 38;
var Hi = 39;
var ji = 42;
var en = 44;
var Ui = 45;
var q = 58;
var Ki = 61;
var qi = 62;
var Gi = 63;
var Wi = 64;
var nn = 91;
var rn = 93;
var $i = 96;
var ln = 123;
var Qi = 124;
var on = 125;
var _ = {};
_[0] = "\\0";
_[7] = "\\a";
_[8] = "\\b";
_[9] = "\\t";
_[10] = "\\n";
_[11] = "\\v";
_[12] = "\\f";
_[13] = "\\r";
_[27] = "\\e";
_[34] = '\\"';
_[92] = "\\\\";
_[133] = "\\N";
_[160] = "\\_";
_[8232] = "\\L";
_[8233] = "\\P";
var Vi = ["y", "Y", "yes", "Yes", "YES", "on", "On", "ON", "n", "N", "no", "No", "NO", "off", "Off", "OFF"];
var Xi = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function Zi(e, n) {
  var i, l, r, u, o, f, c;
  if (n === null) return {};
  for (i = {}, l = Object.keys(n), r = 0, u = l.length; r < u; r += 1) o = l[r], f = String(n[o]), o.slice(0, 2) === "!!" && (o = "tag:yaml.org,2002:" + o.slice(2)), c = e.compiledTypeMap.fallback[o], c && Je.call(c.styleAliases, f) && (f = c.styleAliases[f]), i[o] = f;
  return i;
}
function zi(e) {
  var n, i, l;
  if (n = e.toString(16).toUpperCase(), e <= 255) i = "x", l = 2;
  else if (e <= 65535) i = "u", l = 4;
  else if (e <= 4294967295) i = "U", l = 8;
  else throw new w("code point within a string may not be greater than 0xFFFFFFFF");
  return "\\" + i + y.repeat("0", l - n.length) + n;
}
var Ji = 1;
var P = 2;
function er(e) {
  this.schema = e.schema || ie, this.indent = Math.max(1, e.indent || 2), this.noArrayIndent = e.noArrayIndent || false, this.skipInvalid = e.skipInvalid || false, this.flowLevel = y.isNothing(e.flowLevel) ? -1 : e.flowLevel, this.styleMap = Zi(this.schema, e.styles || null), this.sortKeys = e.sortKeys || false, this.lineWidth = e.lineWidth || 80, this.noRefs = e.noRefs || false, this.noCompatMode = e.noCompatMode || false, this.condenseFlow = e.condenseFlow || false, this.quotingType = e.quotingType === '"' ? P : Ji, this.forceQuotes = e.forceQuotes || false, this.replacer = typeof e.replacer == "function" ? e.replacer : null, this.implicitTypes = this.schema.compiledImplicit, this.explicitTypes = this.schema.compiledExplicit, this.tag = null, this.result = "", this.duplicates = [], this.usedDuplicates = null;
}
function se(e, n) {
  for (var i = y.repeat(" ", n), l = 0, r = -1, u = "", o, f = e.length; l < f; ) r = e.indexOf(`
`, l), r === -1 ? (o = e.slice(l), l = f) : (o = e.slice(l, r + 1), l = r + 1), o.length && o !== `
` && (u += i), u += o;
  return u;
}
function z(e, n) {
  return `
` + y.repeat(" ", e.indent * n);
}
function nr(e, n) {
  var i, l, r;
  for (i = 0, l = e.implicitTypes.length; i < l; i += 1) if (r = e.implicitTypes[i], r.resolve(n)) return true;
  return false;
}
function G(e) {
  return e === Di || e === Ni;
}
function H(e) {
  return 32 <= e && e <= 126 || 161 <= e && e <= 55295 && e !== 8232 && e !== 8233 || 57344 <= e && e <= 65533 && e !== oe || 65536 <= e && e <= 1114111;
}
function xe(e) {
  return H(e) && e !== oe && e !== Ri && e !== B;
}
function me(e, n, i) {
  var l = xe(e), r = l && !G(e);
  return (i ? l : l && e !== en && e !== nn && e !== rn && e !== ln && e !== on) && e !== Z && !(n === q && !r) || xe(n) && !G(n) && e === Z || n === q && r;
}
function ir(e) {
  return H(e) && e !== oe && !G(e) && e !== Ui && e !== Gi && e !== q && e !== en && e !== nn && e !== rn && e !== ln && e !== on && e !== Z && e !== Pi && e !== ji && e !== Mi && e !== Qi && e !== Ki && e !== qi && e !== Hi && e !== Yi && e !== Bi && e !== Wi && e !== $i;
}
function rr(e) {
  return !G(e) && e !== q;
}
function M(e, n) {
  var i = e.charCodeAt(n), l;
  return i >= 55296 && i <= 56319 && n + 1 < e.length && (l = e.charCodeAt(n + 1), l >= 56320 && l <= 57343) ? (i - 55296) * 1024 + l - 56320 + 65536 : i;
}
function un(e) {
  var n = /^\n* /;
  return n.test(e);
}
var fn = 1;
var J = 2;
var cn = 3;
var an = 4;
var k = 5;
function lr(e, n, i, l, r, u, o, f) {
  var c, a = 0, t = null, p = false, d = false, s = l !== -1, x = -1, g = ir(M(e, 0)) && rr(M(e, e.length - 1));
  if (n || o) for (c = 0; c < e.length; a >= 65536 ? c += 2 : c++) {
    if (a = M(e, c), !H(a)) return k;
    g = g && me(a, t, f), t = a;
  }
  else {
    for (c = 0; c < e.length; a >= 65536 ? c += 2 : c++) {
      if (a = M(e, c), a === B) p = true, s && (d = d || c - x - 1 > l && e[x + 1] !== " ", x = c);
      else if (!H(a)) return k;
      g = g && me(a, t, f), t = a;
    }
    d = d || s && c - x - 1 > l && e[x + 1] !== " ";
  }
  return !p && !d ? g && !o && !r(e) ? fn : u === P ? k : J : i > 9 && un(e) ? k : o ? u === P ? k : J : d ? an : cn;
}
function or(e, n, i, l, r) {
  e.dump = (function() {
    if (n.length === 0) return e.quotingType === P ? '""' : "''";
    if (!e.noCompatMode && (Vi.indexOf(n) !== -1 || Xi.test(n))) return e.quotingType === P ? '"' + n + '"' : "'" + n + "'";
    var u = e.indent * Math.max(1, i), o = e.lineWidth === -1 ? -1 : Math.max(Math.min(e.lineWidth, 40), e.lineWidth - u), f = l || e.flowLevel > -1 && i >= e.flowLevel;
    function c(a) {
      return nr(e, a);
    }
    switch (lr(n, f, e.indent, o, c, e.quotingType, e.forceQuotes && !l, r)) {
      case fn:
        return n;
      case J:
        return "'" + n.replace(/'/g, "''") + "'";
      case cn:
        return "|" + ge(n, e.indent) + Ae(se(n, u));
      case an:
        return ">" + ge(n, e.indent) + Ae(se(ur(n, o), u));
      case k:
        return '"' + fr(n) + '"';
      default:
        throw new w("impossible error: invalid scalar style");
    }
  })();
}
function ge(e, n) {
  var i = un(e) ? String(n) : "", l = e[e.length - 1] === `
`, r = l && (e[e.length - 2] === `
` || e === `
`), u = r ? "+" : l ? "" : "-";
  return i + u + `
`;
}
function Ae(e) {
  return e[e.length - 1] === `
` ? e.slice(0, -1) : e;
}
function ur(e, n) {
  for (var i = /(\n+)([^\n]*)/g, l = (function() {
    var a = e.indexOf(`
`);
    return a = a !== -1 ? a : e.length, i.lastIndex = a, ve(e.slice(0, a), n);
  })(), r = e[0] === `
` || e[0] === " ", u, o; o = i.exec(e); ) {
    var f = o[1], c = o[2];
    u = c[0] === " ", l += f + (!r && !u && c !== "" ? `
` : "") + ve(c, n), r = u;
  }
  return l;
}
function ve(e, n) {
  if (e === "" || e[0] === " ") return e;
  for (var i = / [^ ]/g, l, r = 0, u, o = 0, f = 0, c = ""; l = i.exec(e); ) f = l.index, f - r > n && (u = o > r ? o : f, c += `
` + e.slice(r, u), r = u + 1), o = f;
  return c += `
`, e.length - r > n && o > r ? c += e.slice(r, o) + `
` + e.slice(o + 1) : c += e.slice(r), c.slice(1);
}
function fr(e) {
  for (var n = "", i = 0, l, r = 0; r < e.length; i >= 65536 ? r += 2 : r++) i = M(e, r), l = _[i], !l && H(i) ? (n += e[r], i >= 65536 && (n += e[r + 1])) : n += l || zi(i);
  return n;
}
function cr(e, n, i) {
  var l = "", r = e.tag, u, o, f;
  for (u = 0, o = i.length; u < o; u += 1) f = i[u], e.replacer && (f = e.replacer.call(i, String(u), f)), (b(e, n, f, false, false) || typeof f > "u" && b(e, n, null, false, false)) && (l !== "" && (l += "," + (e.condenseFlow ? "" : " ")), l += e.dump);
  e.tag = r, e.dump = "[" + l + "]";
}
function ye(e, n, i, l) {
  var r = "", u = e.tag, o, f, c;
  for (o = 0, f = i.length; o < f; o += 1) c = i[o], e.replacer && (c = e.replacer.call(i, String(o), c)), (b(e, n + 1, c, true, true, false, true) || typeof c > "u" && b(e, n + 1, null, true, true, false, true)) && ((!l || r !== "") && (r += z(e, n)), e.dump && B === e.dump.charCodeAt(0) ? r += "-" : r += "- ", r += e.dump);
  e.tag = u, e.dump = r || "[]";
}
function ar(e, n, i) {
  var l = "", r = e.tag, u = Object.keys(i), o, f, c, a, t;
  for (o = 0, f = u.length; o < f; o += 1) t = "", l !== "" && (t += ", "), e.condenseFlow && (t += '"'), c = u[o], a = i[c], e.replacer && (a = e.replacer.call(i, c, a)), b(e, n, c, false, false) && (e.dump.length > 1024 && (t += "? "), t += e.dump + (e.condenseFlow ? '"' : "") + ":" + (e.condenseFlow ? "" : " "), b(e, n, a, false, false) && (t += e.dump, l += t));
  e.tag = r, e.dump = "{" + l + "}";
}
function pr(e, n, i, l) {
  var r = "", u = e.tag, o = Object.keys(i), f, c, a, t, p, d;
  if (e.sortKeys === true) o.sort();
  else if (typeof e.sortKeys == "function") o.sort(e.sortKeys);
  else if (e.sortKeys) throw new w("sortKeys must be a boolean or a function");
  for (f = 0, c = o.length; f < c; f += 1) d = "", (!l || r !== "") && (d += z(e, n)), a = o[f], t = i[a], e.replacer && (t = e.replacer.call(i, a, t)), b(e, n + 1, a, true, true, true) && (p = e.tag !== null && e.tag !== "?" || e.dump && e.dump.length > 1024, p && (e.dump && B === e.dump.charCodeAt(0) ? d += "?" : d += "? "), d += e.dump, p && (d += z(e, n)), b(e, n + 1, t, true, p) && (e.dump && B === e.dump.charCodeAt(0) ? d += ":" : d += ": ", d += e.dump, r += d));
  e.tag = u, e.dump = r || "{}";
}
function Ce(e, n, i) {
  var l, r, u, o, f, c;
  for (r = i ? e.explicitTypes : e.implicitTypes, u = 0, o = r.length; u < o; u += 1) if (f = r[u], (f.instanceOf || f.predicate) && (!f.instanceOf || typeof n == "object" && n instanceof f.instanceOf) && (!f.predicate || f.predicate(n))) {
    if (i ? f.multi && f.representName ? e.tag = f.representName(n) : e.tag = f.tag : e.tag = "?", f.represent) {
      if (c = e.styleMap[f.tag] || f.defaultStyle, ze.call(f.represent) === "[object Function]") l = f.represent(n, c);
      else if (Je.call(f.represent, c)) l = f.represent[c](n, c);
      else throw new w("!<" + f.tag + '> tag resolver accepts not "' + c + '" style');
      e.dump = l;
    }
    return true;
  }
  return false;
}
function b(e, n, i, l, r, u, o) {
  e.tag = null, e.dump = i, Ce(e, i, false) || Ce(e, i, true);
  var f = ze.call(e.dump), c = l, a;
  l && (l = e.flowLevel < 0 || e.flowLevel > n);
  var t = f === "[object Object]" || f === "[object Array]", p, d;
  if (t && (p = e.duplicates.indexOf(i), d = p !== -1), (e.tag !== null && e.tag !== "?" || d || e.indent !== 2 && n > 0) && (r = false), d && e.usedDuplicates[p]) e.dump = "*ref_" + p;
  else {
    if (t && d && !e.usedDuplicates[p] && (e.usedDuplicates[p] = true), f === "[object Object]") l && Object.keys(e.dump).length !== 0 ? (pr(e, n, e.dump, r), d && (e.dump = "&ref_" + p + e.dump)) : (ar(e, n, e.dump), d && (e.dump = "&ref_" + p + " " + e.dump));
    else if (f === "[object Array]") l && e.dump.length !== 0 ? (e.noArrayIndent && !o && n > 0 ? ye(e, n - 1, e.dump, r) : ye(e, n, e.dump, r), d && (e.dump = "&ref_" + p + e.dump)) : (cr(e, n, e.dump), d && (e.dump = "&ref_" + p + " " + e.dump));
    else if (f === "[object String]") e.tag !== "?" && or(e, e.dump, n, u, c);
    else {
      if (f === "[object Undefined]") return false;
      if (e.skipInvalid) return false;
      throw new w("unacceptable kind of an object to dump " + f);
    }
    e.tag !== null && e.tag !== "?" && (a = encodeURI(e.tag[0] === "!" ? e.tag.slice(1) : e.tag).replace(/!/g, "%21"), e.tag[0] === "!" ? a = "!" + a : a.slice(0, 18) === "tag:yaml.org,2002:" ? a = "!!" + a.slice(18) : a = "!<" + a + ">", e.dump = a + " " + e.dump);
  }
  return true;
}
function tr(e, n) {
  var i = [], l = [], r, u;
  for (ee(e, i, l), r = 0, u = l.length; r < u; r += 1) n.duplicates.push(i[l[r]]);
  n.usedDuplicates = new Array(u);
}
function ee(e, n, i) {
  var l, r, u;
  if (e !== null && typeof e == "object") if (r = n.indexOf(e), r !== -1) i.indexOf(r) === -1 && i.push(r);
  else if (n.push(e), Array.isArray(e)) for (r = 0, u = e.length; r < u; r += 1) ee(e[r], n, i);
  else for (l = Object.keys(e), r = 0, u = l.length; r < u; r += 1) ee(e[l[r]], n, i);
}
function hr(e, n) {
  n = n || {};
  var i = new er(n);
  i.noRefs || tr(e, i);
  var l = e;
  return i.replacer && (l = i.replacer.call({ "": l }, "", l)), b(i, 0, l, true, true) ? i.dump + `
` : "";
}
var dr = hr;
var sr = { dump: dr };
function ue(e, n) {
  return function() {
    throw new Error("Function yaml." + e + " is removed in js-yaml 4. Use yaml." + n + " instead, which is now safe by default.");
  };
}
var vr = Re;
var Cr = Ze.load;
var _r = Ze.loadAll;
var wr = sr.dump;
var Fr = ue("safeLoad", "load");
var br = ue("safeLoadAll", "loadAll");
var Tr = ue("safeDump", "dump");

// src/core/ids.js
var ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
function randomToken(n = 4) {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (const b2 of bytes) s += ALPHABET[b2 % ALPHABET.length];
  return s;
}
function newId(prefix, iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || "");
  if (m) return `${prefix}-${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}-${randomToken(4)}`;
  return `${prefix}-${Date.now().toString(36)}-${randomToken(4)}`;
}
var ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/i;
function isSafeId(id) {
  return typeof id === "string" && id.length <= 120 && ID_PATTERN.test(id) && !id.includes("..");
}

// src/core/format.js
var FM = "---";
var FIELD_ORDER = {
  entry: [
    "id",
    "type",
    "kind",
    "day",
    "created",
    "updated",
    "tz",
    "title",
    "author",
    "privacy",
    "tags",
    "category",
    "question",
    "prompt",
    "media",
    "transcript",
    "conversation",
    "document",
    "source",
    "links",
    "imported",
    "sealed",
    "deleted"
  ],
  day: ["id", "type", "date", "rating", "rating_scale", "best", "hardest", "emotions", "updated", "source", "imported"],
  event: ["id", "type", "day", "title", "start", "end", "all_day", "location", "calendar", "source", "updated"],
  claim: [
    "id",
    "type",
    "section",
    "statement",
    "status",
    "origin",
    "confidence",
    "evidence",
    "alternatives",
    "would_change_if",
    "expects",
    "coverage",
    "created",
    "updated",
    "history"
  ],
  proposal: [
    "id",
    "type",
    "op",
    "status",
    "target",
    "author",
    "created",
    "predicted_acceptance",
    "payload",
    "rationale",
    "evidence",
    "alternatives",
    "coverage",
    "decided",
    "decision",
    "snooze_until"
  ],
  question: [
    "id",
    "type",
    "text",
    "kind",
    "origin",
    "topic",
    "sensitivity",
    "status",
    "rationale",
    "evidence",
    "created",
    "updated",
    "snooze_until",
    "last_shown",
    "shown_count",
    "answers",
    "feedback",
    "source"
  ],
  interpretation: ["id", "type", "kind", "of", "author", "status", "created", "range", "source"],
  report: ["id", "type", "kind", "created", "summary"],
  // Research: one file per thing you saved to read (src/core/sources.js).
  source: [
    "id",
    "type",
    "kind",
    "title",
    "url",
    "doi",
    "authors",
    "year",
    "site",
    "status",
    "favourite",
    "tags",
    "added",
    "updated",
    "started",
    "finished",
    "why",
    "expect",
    "surprised",
    "quotes",
    "assist",
    "prompt",
    "prompted",
    "agent_notes",
    "visibility",
    "captured"
  ],
  // Corkboard (src/core/boards.js): a board, the things pinned to it, and the strings between them.
  // A pin's body is its note; a string's body is your synthesis — how the two connect.
  board: ["id", "type", "title", "about", "piece", "tags", "author", "created", "updated", "visibility"],
  pin: [
    "id",
    "type",
    "board",
    "kind",
    "title",
    "x",
    "y",
    "w",
    "h",
    "color",
    "card",
    "source",
    "url",
    "address",
    "author",
    "created",
    "updated"
  ],
  string: [
    "id",
    "type",
    "board",
    "from",
    "to",
    "label",
    "state",
    "tier",
    "holds_in",
    "breaks_at",
    "author",
    "created",
    "updated",
    "synthesised",
    "synthesised_by"
  ],
  // An Infodex card (src/core/infodex.js): the thing's call number and snapshot; the body is your entries about it.
  // `source: atlas` cards are Atlas entries (src/core/atlas.js); the rest are made from Wikidata.
  card: [
    "id",
    "type",
    "source",
    "atlas",
    "qid",
    "label",
    "desc",
    "kind",
    "subtitle",
    "address",
    "status",
    "standing",
    "credence",
    "review",
    "path",
    "edges",
    "sprite",
    "atlas_version",
    "rarity",
    "sitelinks",
    "finish",
    "insight",
    "img",
    "lineage",
    "stats",
    "flavor",
    "questions",
    "bridges",
    "links",
    "by",
    "minted",
    "added",
    "updated"
  ],
  // A piece of writing (src/core/writing.js); the body is your draft.
  piece: ["id", "type", "title", "status", "board", "task", "sources", "cards", "author", "created", "updated", "visibility"]
};
var SEALED_NOTE = "_Sealed entry: its text is encrypted with your journal passphrase._";
var BODY_TYPES = /* @__PURE__ */ new Set([
  "entry",
  "day",
  "claim",
  "interpretation",
  "report",
  "proposal",
  "question",
  "source",
  "board",
  "pin",
  "string",
  "card",
  "piece"
]);
function pathFor(rec) {
  if (!rec || !isSafeId(rec.id)) return null;
  switch (rec.type) {
    case "entry": {
      const [y2, m] = (rec.day || "").split("-");
      return y2 && m ? `entries/${y2}/${m}/${rec.id}.md` : null;
    }
    case "day":
      return /^\d{4}-\d{2}-\d{2}$/.test(rec.id) ? `days/${rec.id.slice(0, 4)}/${rec.id}.md` : null;
    case "event": {
      const [y2, m] = (rec.day || "").split("-");
      return y2 && m ? `events/${y2}/${m}/${rec.id}.md` : null;
    }
    case "claim":
      return `meta/claims/${rec.id}.md`;
    case "proposal":
      return `meta/proposals/${rec.id}.md`;
    case "question":
      return `meta/questions/${rec.id}.md`;
    case "interpretation":
      return `interpretations/${(rec.created || "0000").slice(0, 4)}/${rec.id}.md`;
    case "report":
      return `imports/${rec.id}.md`;
    case "source": {
      const m = /^s-(\d{4})(\d{2})\d{2}-/.exec(rec.id);
      return m ? `sources/${m[1]}/${m[2]}/${rec.id}.md` : null;
    }
    case "board":
      return `boards/${rec.id}.md`;
    case "pin":
      return isSafeId(rec.board) ? `boards/${rec.board}/pins/${rec.id}.md` : null;
    case "string":
      return isSafeId(rec.board) ? `boards/${rec.board}/strings/${rec.id}.md` : null;
    case "card":
      return `cards/${rec.id}.md`;
    case "piece":
      return `writing/${rec.id}.md`;
    case "config":
      return rec.id.startsWith("config:") ? `config/${rec.id.slice(7)}.yaml` : null;
    default:
      return null;
  }
}
var TEXT_PREFIXES = ["entries/", "days/", "events/", "meta/claims/", "meta/proposals/", "meta/questions/", "interpretations/", "imports/", "sources/", "boards/", "cards/", "writing/", "config/"];
function isRecordPath(p) {
  if (!TEXT_PREFIXES.some((pre) => p.startsWith(pre))) return false;
  return p.startsWith("config/") ? p.endsWith(".yaml") : p.endsWith(".md");
}
var MIME_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/aac": "aac",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md"
};
var EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([k2, v2]) => [v2, k2]));
EXT_MIME.jpeg = "image/jpeg";
EXT_MIME.mov = "video/quicktime";
function ordered(rec, type) {
  const order = FIELD_ORDER[type] || ["id", "type"];
  const out = {};
  for (const k2 of order) if (k2 in rec) out[k2] = rec[k2];
  for (const k2 of Object.keys(rec).sort()) if (!(k2 in out)) out[k2] = rec[k2];
  return out;
}
function stripLocal(v2, top = true) {
  if (Array.isArray(v2)) return v2.map((x) => stripLocal(x, false)).filter((x) => x !== void 0);
  if (v2 && typeof v2 === "object") {
    const out = {};
    for (const [k2, val] of Object.entries(v2)) {
      if (k2.startsWith("_")) continue;
      if (top && k2 === "body") continue;
      const s = stripLocal(val, false);
      if (s === void 0 || s === null) continue;
      if (Array.isArray(s) && s.length === 0) continue;
      if (s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).length === 0) continue;
      if (s === "" && k2 !== "statement") continue;
      out[k2] = s;
    }
    return out;
  }
  return v2;
}
var DUMP_OPTS = { schema: vr, lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"', noCompatMode: true };
function yamlDump(obj) {
  return wr(obj, DUMP_OPTS);
}
function yamlLoad(text) {
  return Cr(text, { schema: vr });
}
function serialize(rec) {
  if (rec.type === "config") {
    const { id, type, ...rest } = stripLocal({ ...rec, body: void 0 });
    return yamlDump({ id: rec.id, ...rest });
  }
  const data = ordered(stripLocal(rec), rec.type);
  let out = `${FM}
${yamlDump(data)}${FM}
`;
  const body = rec.sealed ? SEALED_NOTE : BODY_TYPES.has(rec.type) ? String(rec.body || "").replace(/\s+$/, "") : "";
  if (body) out += `${body}
`;
  return out;
}
function splitFrontmatter(text) {
  const t = String(text).replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!t.startsWith(FM + "\n")) return { data: {}, body: t, hadFrontmatter: false };
  const end = t.indexOf(`
${FM}`, FM.length);
  if (end === -1) return { data: {}, body: t, hadFrontmatter: false };
  const yamlText = t.slice(FM.length + 1, end + 1);
  let rest = t.slice(end + FM.length + 1);
  if (rest.startsWith("\n")) rest = rest.slice(1);
  const data = yamlLoad(yamlText) || {};
  return { data, body: rest, hadFrontmatter: true };
}
function parse(path2, text) {
  if (path2.startsWith("config/")) {
    const data2 = yamlLoad(text) || {};
    const name2 = path2.slice(7).replace(/\.yaml$/, "");
    return { ...data2, id: `config:${name2}`, type: "config" };
  }
  const { data, body } = splitFrontmatter(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${path2}: frontmatter is not a mapping`);
  const rec = { ...data };
  if (!rec.type) rec.type = inferType(path2);
  if (!rec.id) rec.id = idFromPath(path2);
  if (!isSafeId(String(rec.id))) throw new Error(`${path2}: unsafe id ${JSON.stringify(String(rec.id)).slice(0, 60)}`);
  const b2 = body.replace(/\s+$/, "");
  if (BODY_TYPES.has(rec.type) && !rec.sealed) rec.body = b2;
  if (rec.type === "day" && !rec.date) rec.date = rec.id;
  return rec;
}
function inferType(path2) {
  if (path2.startsWith("entries/")) return "entry";
  if (path2.startsWith("days/")) return "day";
  if (path2.startsWith("events/")) return "event";
  if (path2.startsWith("meta/claims/")) return "claim";
  if (path2.startsWith("meta/proposals/")) return "proposal";
  if (path2.startsWith("meta/questions/")) return "question";
  if (path2.startsWith("interpretations/")) return "interpretation";
  if (path2.startsWith("imports/")) return "report";
  if (path2.startsWith("sources/")) return "source";
  if (path2.startsWith("boards/")) return /^boards\/[^/]+\/pins\//.test(path2) ? "pin" : /^boards\/[^/]+\/strings\//.test(path2) ? "string" : "board";
  if (path2.startsWith("cards/")) return "card";
  if (path2.startsWith("writing/")) return "piece";
  if (path2.startsWith("config/")) return "config";
  return null;
}
function idFromPath(path2) {
  const file = path2.split("/").pop();
  if (path2.startsWith("config/")) return `config:${file.replace(/\.yaml$/, "")}`;
  return file.replace(/\.md$/, "");
}

// src/core/dates.js
function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
var partsCache = /* @__PURE__ */ new Map();
function formatterFor(tz) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    partsCache.set(tz, f);
  }
  return f;
}
function wallParts(date, tz = deviceTimeZone()) {
  const out = {};
  for (const p of formatterFor(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  if (out.hour === 24) out.hour = 0;
  return out;
}
function tzOffsetMinutes(date, tz = deviceTimeZone()) {
  const p = wallParts(date, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const ms = date.getTime() - date.getTime() % 1e3;
  return Math.round((asUTC - ms) / 6e4);
}
var pad = (n, w2 = 2) => String(n).padStart(w2, "0");
function isoLocal(date = /* @__PURE__ */ new Date(), tz = deviceTimeZone()) {
  const p = wallParts(date, tz);
  const off = tzOffsetMinutes(date, tz);
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

// src/core/model.js
var RECORD_TYPES = ["entry", "day", "event", "claim", "proposal", "question", "interpretation", "config", "report", "source", "board", "pin", "string", "card", "piece"];
var ENTRY_KINDS = {
  text: "Writing",
  voice: "Voice note",
  photo: "Photos",
  conversation: "Conversation",
  document: "Document",
  import: "Imported"
};
var PRIVACY_LEVELS = {
  normal: { label: "Normal", hint: "Synced and searchable. AI reads it only when you ask for AI help." },
  "no-ai": { label: "No AI", hint: "Synced and searchable, never sent to any AI \u2014 in the app or by a steward session." },
  sealed: { label: "Sealed", hint: "Encrypted with your passphrase before it is saved or synced. Unreadable without it." }
};
var CLAIM_SECTIONS = [
  { id: "orientation", label: "Current orientation", hint: "What occupies your attention, what you care about now, what you are trying to understand." },
  { id: "emotional", label: "Emotional landscape", hint: "Recurring feelings, possible triggers, sources of relief, what has helped." },
  { id: "ideas", label: "Ideas and evolving beliefs", hint: "Concepts you are developing, assumptions you are questioning." },
  { id: "changes", label: "Changes over time", hint: "How priorities, habits and interpretations differ from earlier periods." },
  { id: "open", label: "Open questions and possible blind spots", hint: "Unresolved questions, tensions between values, alternative explanations." },
  { id: "growth", label: "Growth and experiments", hint: "Things you want to change, experiments tried, what you learned." }
];
var SECTION_IDS = CLAIM_SECTIONS.map((s) => s.id);
var CONFIDENCE_LEVELS = {
  tentative: "A first guess from little evidence",
  moderate: "Several consistent entries, few counterexamples",
  strong: "Consistent across time and contexts"
};
var PROPOSAL_OPS = {
  "add-claim": "New pattern",
  "revise-claim": "Revision",
  "retire-claim": "Retire",
  "add-question": "Question",
  "link-entries": "Connection"
};
function validateRecord(rec) {
  const errors = [];
  if (!rec || typeof rec !== "object") return ["not an object"];
  if (!rec.id) errors.push("missing id");
  if (!RECORD_TYPES.includes(rec.type)) errors.push(`unknown type "${rec.type}"`);
  if (rec.deleted) return errors;
  switch (rec.type) {
    case "entry":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.day || "")) errors.push("entry.day must be YYYY-MM-DD");
      if (!rec.created) errors.push("entry.created missing");
      if (rec.kind && !ENTRY_KINDS[rec.kind]) errors.push(`unknown entry kind "${rec.kind}"`);
      if (rec.privacy && !PRIVACY_LEVELS[rec.privacy]) errors.push(`unknown privacy "${rec.privacy}"`);
      if (rec.privacy === "sealed" && !rec.sealed && rec.body) errors.push("sealed entry has plaintext body");
      break;
    case "day":
      if (rec.id !== rec.date) errors.push("day id must equal its date");
      if (rec.rating != null) {
        const s = Number(rec.rating_scale) || 10;
        const v2 = Number(rec.rating);
        if (!Number.isFinite(v2) || v2 < 0 || v2 > s) errors.push(`rating ${rec.rating} outside scale ${s}`);
      }
      break;
    case "source":
      if (!rec.title && !rec.url) errors.push("source needs a title or a link");
      if (rec.status && !["inbox", "to-read", "reading", "read", "dropped", "filed"].includes(rec.status)) errors.push(`unknown status "${rec.status}"`);
      if (rec.assist != null && typeof rec.assist !== "boolean") errors.push("assist must be true or false");
      for (const n of rec.agent_notes || []) if (!n?.text || !n?.author || !n?.date) errors.push("an agent note needs text, author and date");
      break;
    case "board":
      if (!rec.title) errors.push("board needs a title");
      break;
    case "pin":
      if (!rec.board) errors.push("pin needs its board");
      if (!["note", "card", "source", "quote", "link", "frame"].includes(rec.kind)) errors.push(`unknown pin kind "${rec.kind}"`);
      for (const k2 of ["x", "y"]) if (rec[k2] != null && !Number.isFinite(rec[k2])) errors.push(`pin ${k2} is not a number`);
      if (rec.kind === "card" && !rec.card) errors.push("card pin needs its card");
      break;
    case "string":
      if (!rec.board || !rec.from || !rec.to) errors.push("string needs its board and both ends");
      if (rec.from && rec.from === rec.to) errors.push("string joins a pin to itself");
      if (!["red", "synthesised"].includes(rec.state)) errors.push(`unknown string state "${rec.state}"`);
      if (rec.state === "synthesised" && !String(rec.body || "").trim()) errors.push("synthesised string has no synthesis");
      break;
    case "card":
      if (rec.source === "atlas") {
        if (!rec.atlas) errors.push("Atlas card needs its entry id");
      } else if (!/^Q\d+$/.test(String(rec.qid || ""))) errors.push("card needs a Wikidata id (Q\u2026)");
      break;
    case "piece":
      if (!rec.title) errors.push("piece needs a title");
      if (rec.status && !["idea", "drafting", "review", "done"].includes(rec.status)) errors.push(`unknown piece status "${rec.status}"`);
      break;
    case "claim":
      if (!SECTION_IDS.includes(rec.section)) errors.push(`unknown section "${rec.section}"`);
      if (!rec.statement) errors.push("claim has no statement");
      if (rec.confidence && !CONFIDENCE_LEVELS[rec.confidence]) errors.push(`unknown confidence "${rec.confidence}"`);
      break;
    case "proposal":
      if (!PROPOSAL_OPS[rec.op]) errors.push(`unknown op "${rec.op}"`);
      if (rec.predicted_acceptance != null && !(rec.predicted_acceptance >= 0 && rec.predicted_acceptance <= 1)) errors.push("predicted_acceptance must be 0..1");
      break;
    case "question":
      if (!rec.text) errors.push("question has no text");
      break;
  }
  return errors;
}

// src/core/search.js
var STOP = new Set(`a an and are as at be been but by can could did do does for from had has have he her his
i if in into is it its just me my of on or our so than that the their them then there these they this to too
up us was we were what when where which who why will with would you your im ive dont didnt its thats also
about after again all am any because before being both each few more most much no nor not now only other
out over own same she should some such through under until very while got get really today day like
felt feel feeling feels thing things something anything everything time times days week weeks tonight
morning afternoon evening night yesterday tomorrow lot bit way back still even well good bad kind sort
quite maybe think thought know knew going went come came make made want wanted need little big new old
m\u1ED9t nh\u1EEFng c\xE1c c\u1EE7a v\xE0 l\xE0 c\xF3 kh\xF4ng \u0111\u01B0\u1EE3c cho v\u1EDBi n\xE0y \u0111\xE3 \u0111i r\u1EA5t th\xEC m\xE0 \u0111\u1EC3 \u1EDF trong khi c\u0169ng nh\u01B0 l\u1EA1i ng\u01B0\u1EDDi
ra v\u1EC1 v\xE0o n\xEAn nh\u01B0ng v\xEC t\u1EEB \u0111\xF3 l\xE0m c\xF2n h\u01A1n b\u1ECB theo nhi\u1EC1u t\xF4i m\xECnh em anh ch\u1ECB \u1EA5y`.split(/\s+/).map(foldWord));
function foldChar(ch) {
  if (ch === "\u0111" || ch === "\u0110") return "d";
  if (ch === "\u2019" || ch === "\u2018") return "'";
  return ch.normalize("NFD").replace(new RegExp("\\p{M}", "gu"), "").toLowerCase();
}
function foldWord(w2) {
  let s = "";
  for (const ch of w2) s += foldChar(ch);
  return s;
}
function fold(text) {
  return foldWord(String(text || ""));
}
function tokenize(text, { minLen = 2 } = {}) {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= minLen);
}

// src/core/sources.js
var STATUSES = { inbox: "Deposit", "to-read": "To read", reading: "Reading", read: "Read", dropped: "Dropped", filed: "Filed" };
var KINDS = { article: "Article", paper: "Paper", book: "Book", video: "Video", podcast: "Podcast", image: "Image", thought: "Thought", other: "Other" };
var TRACKING = /^(utm_\w+|fbclid|gclid|dclid|mc_cid|mc_eid|igshid|si|ref_src|ref_url|_hsenc|_hsmi|mkt_tok|spm|share_source)$/i;
function normalizeUrl(input) {
  let u;
  try {
    u = new URL(String(input || "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const k2 of [...u.searchParams.keys()]) if (TRACKING.test(k2)) u.searchParams.delete(k2);
  let s = u.toString();
  if (u.pathname !== "/" && s.endsWith("/") && !u.search) s = s.slice(0, -1);
  return s;
}
function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function firstUrl(text) {
  const m = /https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]/i.exec(String(text || ""));
  return m ? m[0] : null;
}
function findDoi(text) {
  const m = /\b(10\.\d{4,9}\/[^\s"<>]+)/i.exec(decodeURIComponentSafe(String(text || "")));
  return m ? m[1].replace(/[.,;:)\]}>]+$/, "").replace(/\/(full|abstract|pdf)$/i, "") : null;
}
function findArxiv(text) {
  const m = /(?:arxiv\.org\/(?:abs|pdf|html)\/|arxiv:\s*)(\d{4}\.\d{4,5})(v\d+)?/i.exec(String(text || ""));
  return m ? m[1] : null;
}
function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
function kindFromUrl(url, { doi } = {}) {
  const s = String(url || "").toLowerCase();
  if (doi || findArxiv(s) || /\.pdf($|\?)/.test(s) || /(doi\.org|arxiv\.org|ssrn\.com|biorxiv|medrxiv|philpapers|semanticscholar|openreview)/.test(s)) return "paper";
  if (/(youtube\.com|youtu\.be|vimeo\.com)/.test(s)) return "video";
  if (/(podcasts?\.|spotify\.com\/episode|overcast\.fm)/.test(s)) return "podcast";
  if (/\.(png|jpe?g|gif|webp|svg)($|\?)/.test(s)) return "image";
  return "article";
}
function guessTitle(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "";
  }
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponentSafe);
  const seg = [...parts].reverse().find((p) => /[a-z]{3,}/i.test(p) && !/^(index|amp|post|posts|p|article|articles|blog|news)$/i.test(p.replace(/\.\w+$/, "")));
  if (!seg) return siteOf(url);
  const words = seg.replace(/\.(html?|php|aspx?|pdf)$/i, "").replace(/[-_+]+/g, " ").replace(/\b[0-9a-f]{8,}\b/gi, "").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : siteOf(url);
}
function parseShared({ title = "", text = "", url = "" } = {}) {
  const link = normalizeUrl(url) || normalizeUrl(firstUrl(text)) || normalizeUrl(firstUrl(title));
  let name2 = String(title || "").trim();
  if (!name2 || normalizeUrl(name2) === link) {
    const rest = String(text || "").replace(firstUrl(text) || "", "").replace(/\s+/g, " ").trim().replace(/[-–—:|]+$/, "").trim();
    name2 = rest && rest.length <= 300 ? rest : "";
  }
  const doi = findDoi(link || "") || findDoi(text);
  const arxiv = findArxiv(link || "") || findArxiv(text);
  return { url: link, title: name2, doi: doi || (arxiv ? `10.48550/arXiv.${arxiv}` : null) };
}
function cleanTag(tag) {
  return String(tag || "").trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]+/gu, "").replace(/^-+|-+$/g, "");
}
function cleanTags(tags) {
  return [...new Set((tags || []).map(cleanTag).filter(Boolean))];
}
function makeSource(fields = {}, { now, device = "", via = "app" } = {}) {
  const added = fields.added || now;
  const url = normalizeUrl(fields.url) || void 0;
  const doi = fields.doi || findDoi(url || "") || void 0;
  return {
    id: fields.id || newId("s", added),
    type: "source",
    kind: fields.kind || kindFromUrl(url, { doi }),
    title: String(fields.title || "").trim() || (url ? guessTitle(url) : ""),
    url,
    doi,
    authors: fields.authors?.length ? fields.authors : void 0,
    year: fields.year || void 0,
    site: fields.site || (url ? siteOf(url) : void 0),
    status: fields.status || "inbox",
    favourite: !!fields.favourite,
    tags: cleanTags(fields.tags),
    added,
    why: String(fields.why || "").trim() || void 0,
    expect: String(fields.expect || "").trim() || void 0,
    quotes: fields.quotes?.length ? fields.quotes : void 0,
    media: fields.media?.length ? fields.media : void 0,
    visibility: "private",
    captured: { via, device: device || void 0 },
    body: fields.body || ""
  };
}
function statusPatch(rec, status, now) {
  const patch = { status };
  if (status === "reading" && !rec.started) patch.started = now;
  if (status === "read" && !rec.finished) patch.finished = now;
  return patch;
}
function formatAuthors(authors = []) {
  const last = (a) => String(a).trim().split(/\s+/).pop();
  if (!authors.length) return "";
  if (authors.length === 1) return last(authors[0]);
  if (authors.length === 2) return `${last(authors[0])} & ${last(authors[1])}`;
  return `${last(authors[0])} et al.`;
}
function findDuplicate(sources, { url, doi }) {
  const u = normalizeUrl(url);
  const d = doi ? String(doi).toLowerCase() : null;
  return sources.find((s) => !s.deleted && (u && normalizeUrl(s.url) === u || d && String(s.doi || "").toLowerCase() === d)) || null;
}
function sourceText(s) {
  return [
    s.title,
    (s.authors || []).join(" "),
    s.site,
    (s.tags || []).map((t) => `#${t}`).join(" "),
    s.why,
    s.expect,
    s.surprised,
    s.prompt,
    s.body,
    ...(s.quotes || []).map((q2) => `${q2.text} ${q2.where || ""}`)
  ].filter(Boolean).join("\n");
}
function searchSources(sources, query) {
  const loose = (t) => t.replace(/[-_]+/g, " ");
  const words = fold(String(query || "")).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return sources.filter((s) => {
    if (s.deleted) return false;
    const hay = loose(fold(sourceText(s)));
    return words.every((w2) => w2.startsWith("#") ? (s.tags || []).includes(w2.slice(1)) : hay.includes(loose(w2)));
  });
}
function tagCounts(sources) {
  const m = /* @__PURE__ */ new Map();
  for (const s of sources) if (!s.deleted) for (const t of s.tags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0]));
}
function assistWaiting(s) {
  if (!s || s.deleted || s.assist !== true || !String(s.prompt || "").trim()) return false;
  const asked = Date.parse(s.prompted || "") || 0;
  return !(s.agent_notes || []).some((n) => (Date.parse(n.date) || 0) >= asked);
}
function assistQueue(sources) {
  return sources.filter(assistWaiting).sort((a, b2) => String(a.prompted || a.added || "").localeCompare(String(b2.prompted || b2.added || "")));
}
function makeAgentNote(text, { author, now }) {
  return { id: newId("an", now), author, date: now, text: String(text || "").trim() };
}

// src/core/boards.js
var PIN_KINDS = {
  note: "Note",
  card: "Infodex card",
  source: "Source",
  quote: "Quote",
  link: "Link",
  frame: "Frame"
};
var TIERS = {
  formal_isomorphism: { name: "Formal isomorphism", hint: "the same mathematics \u2014 an actual mapping", strength: 0.93 },
  shared_mechanism: { name: "Shared mechanism", hint: "the same process on different substrates", strength: 0.85 },
  empirical_regularity: { name: "Empirical regularity", hint: "the same measured pattern; mechanism may be disputed", strength: 0.75 },
  heuristic_analogy: { name: "Heuristic analogy", hint: "a useful comparison, not a derivation", strength: 0.5 },
  resonance: { name: "Resonance", hint: "it feels connected; no mapping offered", strength: 0.3 }
};
var PIN_COLORS = ["paper", "yellow", "pink", "blue", "green", "lilac"];
var SIZES = {
  note: [220, 150],
  card: [200, 280],
  source: [240, 130],
  quote: [260, 140],
  link: [220, 100],
  frame: [640, 420]
};
function defaultSize(kind) {
  const [w2, h2] = SIZES[kind] || SIZES.note;
  return { w: w2, h: h2 };
}
var round = (n) => Math.round(Number(n) || 0);
var clean = (s) => String(s ?? "").trim();
function makeBoard(fields = {}, { now, author = "self" } = {}) {
  return {
    id: fields.id || newId("b", now),
    type: "board",
    title: clean(fields.title) || "Untitled board",
    about: clean(fields.about) || void 0,
    piece: fields.piece || void 0,
    tags: fields.tags?.length ? fields.tags : void 0,
    author,
    created: now,
    updated: now,
    visibility: "private",
    body: ""
  };
}
function makePin(fields = {}, { now, author = "self" } = {}) {
  const kind = PIN_KINDS[fields.kind] ? fields.kind : "note";
  const size = defaultSize(kind);
  return {
    id: fields.id || newId("p", now),
    type: "pin",
    board: fields.board,
    kind,
    title: clean(fields.title) || void 0,
    x: round(fields.x),
    y: round(fields.y),
    w: round(fields.w || size.w),
    h: round(fields.h || size.h),
    color: PIN_COLORS.includes(fields.color) ? fields.color : void 0,
    card: fields.card || void 0,
    source: fields.source || void 0,
    url: fields.url || void 0,
    address: cleanAddress(fields.address),
    author,
    created: now,
    updated: now,
    body: String(fields.text ?? fields.body ?? "").replace(/\s+$/, "")
  };
}
function cleanAddress(a) {
  if (!a || typeof a !== "object") return void 0;
  const out = {};
  for (const k2 of ["domain", "perspective", "scale", "time"]) if (clean(a[k2])) out[k2] = clean(a[k2]);
  return Object.keys(out).length ? out : void 0;
}
function makeString(fields = {}, { now, author = "self" } = {}) {
  return {
    id: fields.id || newId("r", now),
    type: "string",
    board: fields.board,
    from: fields.from,
    to: fields.to,
    label: clean(fields.label) || void 0,
    state: "red",
    author,
    created: now,
    updated: now,
    body: ""
  };
}
function boardParts(records, boardId) {
  const pins = [];
  const strings = [];
  for (const r of records) {
    if (r.deleted || r.board !== boardId) continue;
    if (r.type === "pin") pins.push(r);
    else if (r.type === "string") strings.push(r);
  }
  const ids = new Set(pins.map((p) => p.id));
  return { pins, strings: strings.filter((s) => ids.has(s.from) && ids.has(s.to)) };
}
function boardSummary(parts) {
  const items = parts.pins.filter((p) => p.kind !== "frame");
  const linked = new Set(parts.strings.flatMap((s) => [s.from, s.to]));
  return {
    pins: items.length,
    frames: parts.pins.length - items.length,
    red: parts.strings.filter((s) => s.state !== "synthesised").length,
    synthesised: parts.strings.filter((s) => s.state === "synthesised").length,
    loose: items.filter((p) => !linked.has(p.id)).length
  };
}
var center = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
var inside = (pt, f) => pt.x >= f.x && pt.x <= f.x + f.w && pt.y >= f.y && pt.y <= f.y + f.h;
function framesOf(pin, pins) {
  const c = center(pin);
  return pins.filter((f) => f.kind === "frame" && f.id !== pin.id && inside(c, f)).sort((a, b2) => a.w * a.h - b2.w * b2.h);
}
function addressOf(pin, pins, cardsById = {}) {
  if (pin.kind === "frame" && pin.address) return { ...pin.address, frame: pin.id };
  for (const f of framesOf(pin, pins)) {
    if (f.address?.domain) return { ...f.address, frame: f.id };
  }
  const card = pin.kind === "card" ? cardsById[pin.card] : null;
  if (card?.source === "atlas") return card.address?.domain ? { ...card.address, from: "Atlas" } : null;
  if (card?.kind && card.kind !== "WILD") return { domain: card.kind.charAt(0) + card.kind.slice(1).toLowerCase(), from: "card type" };
  return null;
}
function pinText(pin, { cards = {}, sources = {} } = {}) {
  const c = pin.kind === "card" ? cards[pin.card] : null;
  const s = pin.kind === "source" ? sources[pin.source] : null;
  return [
    pin.title,
    pin.body,
    c?.label,
    c?.desc,
    c?.subtitle,
    c?.address?.domain?.replace(/_/g, " "),
    ...c?.lineage || [],
    s?.title,
    s?.why,
    ...s?.tags || []
  ].filter(Boolean).join(" ");
}
function pinTokens(pin, lookups) {
  return new Set(tokenize(pinText(pin, lookups), { minLen: 3 }).filter((t) => !STOP2.has(t)));
}
var STOP2 = new Set("the and for with that this from into about what when where which while there their they them then than have has had are was were been being not but can could should would will just like more most some such very also only how why who its it's your you our out over under after before because between through does did doing done one two new use used using make made many much other into onto any all each per via vs etc http https www com org html".split(" "));
function placeNear(pins, { anchor = null, w: w2 = 220, h: h2 = 150, gap = 28 } = {}) {
  const solid = pins.filter((p) => p.kind !== "frame");
  const hits = (x, y2) => solid.some((p) => x < p.x + p.w + gap && x + w2 + gap > p.x && y2 < p.y + p.h + gap && y2 + h2 + gap > p.y);
  let cx;
  let cy;
  if (anchor) {
    cx = anchor.x + anchor.w / 2 - w2 / 2;
    cy = anchor.y + anchor.h / 2 - h2 / 2;
  } else if (solid.length) {
    cx = Math.max(...solid.map((p) => p.x + p.w)) + gap * 2;
    cy = Math.min(...solid.map((p) => p.y));
  } else {
    cx = 0;
    cy = 0;
  }
  if (!hits(cx, cy)) return { x: round(cx), y: round(cy) };
  for (let ring = 1; ring < 40; ring++) {
    const r = ring * (Math.max(w2, h2) * 0.6 + gap);
    const steps = 8 + ring * 4;
    for (let i = 0; i < steps; i++) {
      const a = i / steps * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y2 = cy + Math.sin(a) * r;
      if (!hits(x, y2)) return { x: round(x), y: round(y2) };
    }
  }
  return { x: round(cx), y: round(cy + 400) };
}

// src/core/curator.js
var CONTRADICTS = /\b(contradict\w*|conflicts? with|refutes?|incompatible|versus|vs\.?)\b/i;
var sameDomain = (a, b2) => !!(a?.domain && b2?.domain && a.domain.toLowerCase() === b2.domain.toLowerCase());
var differentDomain = (a, b2) => !!(a?.domain && b2?.domain && a.domain.toLowerCase() !== b2.domain.toLowerCase());
function context(parts, cardsById = {}, sourcesById = {}) {
  const byId = Object.fromEntries(parts.pins.map((p) => [p.id, p]));
  const addr = {};
  for (const p of parts.pins) addr[p.id] = addressOf(p, parts.pins, cardsById);
  return { byId, addr, cardsById, sourcesById };
}
var name = (p) => p ? p.title || p.body?.split("\n")[0]?.slice(0, 60) || p.kind : "?";
function checkSynthesis(parts, string, patch, { cards = {}, sources = {} } = {}) {
  const cx = context(parts, cards, sources);
  const problems = [];
  if (!String(patch.body || "").trim()) problems.push({ field: "text", text: "Write how these two connect \u2014 that's what synthesising is." });
  const a = cx.addr[string.from];
  const b2 = cx.addr[string.to];
  const bridge = differentDomain(a, b2);
  const chain = bridge ? null : leakyChain(parts, string, cx);
  if (bridge && !patch.tier) problems.push({ field: "tier", text: `This crosses from ${a.domain} to ${b2.domain}: say what kind of connection it is.` });
  if (chain && !(patch.holds_in && patch.breaks_at)) {
    problems.push({ field: "holds_in", text: `These are also linked through \u201C${name(cx.byId[chain.mid])}\u201D, but that chain holds in \u201C${chain.h1}\u201D on one side and \u201C${chain.h2}\u201D on the other \u2014 chains don't carry across. Say where this connection holds on its own, and where it breaks.` });
  } else {
    if ((patch.tier || bridge) && !patch.holds_in) problems.push({ field: "holds_in", text: "Say where this connection holds." });
    if ((patch.tier || bridge) && !patch.breaks_at) problems.push({ field: "breaks_at", text: "Say where it stops working \u2014 every connection breaks somewhere." });
  }
  if (CONTRADICTS.test(`${patch.label || string.label || ""} ${patch.body || ""}`) && bridge) {
    problems.push({ field: "address", soft: true, text: `Before calling this a contradiction: one side holds in ${a.domain}, the other in ${b2.domain}. A difference of scope isn't a contradiction.` });
  }
  return problems;
}
function holdsIn(s, cx) {
  if (s.holds_in) return s.holds_in;
  const a = cx.addr[s.from];
  const b2 = cx.addr[s.to];
  return sameDomain(a, b2) ? a.domain : null;
}
function leakyChain(parts, string, cx) {
  const legs = parts.strings.filter((s) => s.state === "synthesised" && s.id !== string.id);
  const other = (s, x) => s.from === x ? s.to : s.from;
  for (const s1 of legs.filter((s) => s.from === string.from || s.to === string.from)) {
    const mid = other(s1, string.from);
    const s2 = legs.find((s) => s !== s1 && (s.from === mid || s.to === mid) && other(s, mid) === string.to);
    if (!s2) continue;
    const h1 = holdsIn(s1, cx);
    const h2 = holdsIn(s2, cx);
    if (h1 && h2 && h1.toLowerCase() !== h2.toLowerCase()) return { mid, h1, h2, legs: [s1.id, s2.id] };
  }
  return null;
}
function strengthOf(s) {
  return (TIERS[s.tier] || TIERS.heuristic_analogy).strength;
}
function hopsWithout(parts, from, to, skipId) {
  const adj = {};
  for (const s of parts.strings) {
    if (s.id === skipId) continue;
    (adj[s.from] ||= []).push(s.to);
    (adj[s.to] ||= []).push(s.from);
  }
  const seen = /* @__PURE__ */ new Set([from]);
  let frontier = [from];
  for (let d = 1; d <= 8 && frontier.length; d++) {
    const next = [];
    for (const x of frontier) for (const y2 of adj[x] || []) {
      if (y2 === to) return d;
      if (!seen.has(y2)) {
        seen.add(y2);
        next.push(y2);
      }
    }
    frontier = next;
  }
  return Infinity;
}
function surpriseOf(parts, s, cx) {
  const hops = hopsWithout(parts, s.from, s.to, s.id);
  const structural = hops === Infinity ? 1 : Math.min(1, (hops - 1) / 4);
  const lookups = { cards: cx.cardsById, sources: cx.sourcesById };
  const ta = pinTokens(cx.byId[s.from], lookups);
  const tb = pinTokens(cx.byId[s.to], lookups);
  const union = (/* @__PURE__ */ new Set([...ta, ...tb])).size;
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const lexical = union ? 1 - shared / union : 0.5;
  const a = cx.addr[s.from];
  const b2 = cx.addr[s.to];
  const domain = differentDomain(a, b2) ? 1 : sameDomain(a, b2) ? 0 : 0.5;
  const score = strengthOf(s) * (0.4 * structural + 0.3 * lexical + 0.3 * domain);
  return { score: Math.round(score * 100) / 100, structural, lexical: Math.round(lexical * 100) / 100, domain, hops };
}
function rel(f, g) {
  const ix = Math.max(0, Math.min(f.x + f.w, g.x + g.w) - Math.max(f.x, g.x));
  const iy = Math.max(0, Math.min(f.y + f.h, g.y + g.h) - Math.max(f.y, g.y));
  if (!ix || !iy) return "disjoint";
  const fin = g.x <= f.x && g.y <= f.y && f.x + f.w <= g.x + g.w && f.y + f.h <= g.y + g.h;
  const gin = f.x <= g.x && f.y <= g.y && g.x + g.w <= f.x + f.w && g.y + g.h <= f.y + f.h;
  if (fin) return "inside";
  if (gin) return "contains";
  return "overlap";
}
function curate(parts, { cards = {}, sources = {} } = {}) {
  const cx = context(parts, cards, sources);
  const findings = [];
  const red = parts.strings.filter((s) => s.state !== "synthesised");
  const synth = parts.strings.filter((s) => s.state === "synthesised");
  const items = parts.pins.filter((p) => p.kind !== "frame");
  const frames = parts.pins.filter((p) => p.kind === "frame");
  if (red.length) {
    const byClaude = red.filter((s) => String(s.author || "").startsWith("ai:") || s.author === "claude" || s.author === "claude-code").length;
    findings.push({
      kind: "red",
      level: "info",
      strings: red.map((s) => s.id),
      text: `${red.length} red string${red.length === 1 ? "" : "s"}: connections noticed but not synthesised yet${byClaude ? ` (${byClaude} proposed by Claude)` : ""}.`
    });
  }
  const linked = new Set(parts.strings.flatMap((s) => [s.from, s.to]));
  const loose = items.filter((p) => !linked.has(p.id));
  if (loose.length) findings.push({ kind: "loose", level: "info", pins: loose.map((p) => p.id), text: `${loose.length} pin${loose.length === 1 ? "" : "s"} not connected to anything yet.` });
  for (const s of synth) {
    const chain = differentDomain(cx.addr[s.from], cx.addr[s.to]) ? null : leakyChain(parts, s, cx);
    if (chain && !(s.holds_in && s.breaks_at)) {
      findings.push({
        kind: "leak",
        level: "warn",
        strings: [s.id, ...chain.legs],
        pins: [s.from, chain.mid, s.to],
        text: `\u201C${name(cx.byId[s.from])}\u201D \u2013 \u201C${name(cx.byId[s.to])}\u201D may lean on the chain through \u201C${name(cx.byId[chain.mid])}\u201D, which holds in \u201C${chain.h1}\u201D on one side and \u201C${chain.h2}\u201D on the other. Chains don't carry across boundaries: say where this connection holds on its own.`
      });
      continue;
    }
    const problems = checkSynthesis(parts, s, s, { cards, sources }).filter((p) => !p.soft);
    if (problems.length) findings.push({
      kind: "unbounded",
      level: "check",
      strings: [s.id],
      pins: [s.from, s.to],
      text: `\u201C${name(cx.byId[s.from])}\u201D \u2013 \u201C${name(cx.byId[s.to])}\u201D: ${problems.map((p) => p.text).join(" ")}`
    });
  }
  for (const s of parts.strings) {
    if (!CONTRADICTS.test(`${s.label || ""} ${s.state === "synthesised" ? s.body || "" : ""}`)) continue;
    const a = cx.addr[s.from];
    const b2 = cx.addr[s.to];
    if (differentDomain(a, b2) || a?.scale && b2?.scale && a.scale !== b2.scale || a?.time && b2?.time && a.time !== b2.time) {
      findings.push({
        kind: "scope",
        level: "check",
        strings: [s.id],
        pins: [s.from, s.to],
        text: `\u201C${name(cx.byId[s.from])}\u201D vs \u201C${name(cx.byId[s.to])}\u201D: these sit at different addresses (${[a?.domain, a?.scale, a?.time].filter(Boolean).join(", ")} / ${[b2?.domain, b2?.scale, b2?.time].filter(Boolean).join(", ")}). Is it a contradiction, or a difference of scope?`
      });
    }
  }
  for (let i = 0; i < frames.length; i++) for (let j2 = i + 1; j2 < frames.length; j2++) {
    if (rel(frames[i], frames[j2]) !== "overlap") continue;
    const both = items.filter((p) => framesOf(p, parts.pins).some((f) => f.id === frames[i].id) && framesOf(p, parts.pins).some((f) => f.id === frames[j2].id));
    if (both.length) findings.push({
      kind: "overlap",
      level: "info",
      pins: [frames[i].id, frames[j2].id, ...both.map((p) => p.id)],
      text: `Frames \u201C${name(frames[i])}\u201D and \u201C${name(frames[j2])}\u201D overlap: ${both.length} pin${both.length === 1 ? " sits" : "s sit"} in both. Is that what you mean?`
    });
  }
  const insights = synth.map((s) => ({ string: s.id, from: s.from, to: s.to, ...surpriseOf(parts, s, cx) })).filter((x) => x.score >= 0.25).sort((x, y2) => y2.score - x.score).slice(0, 5);
  const bridges = parts.strings.filter((s) => differentDomain(cx.addr[s.from], cx.addr[s.to])).map((s) => s.id);
  return { findings, insights, bridges };
}

// src/core/infodex.js
var TYPES = {
  MYTH: { name: "Myth", c1: "#ff5fb0", c2: "#8e1f5c", g: "star", roots: ["Q14897293", "Q15707583", "Q95074", "Q64728693"], hard: ["Q14897293", "Q15707583", "Q95074"], blurb: "Gods, legends and fiction: things that live in stories." },
  FIGURE: { name: "Figure", c1: "#ffc94d", c2: "#8a5d00", g: "person", roots: ["Q5", "Q215627"], blurb: "Real people." },
  LIFE: { name: "Life", c1: "#46d17a", c2: "#126a38", g: "leaf", roots: ["Q16521", "Q7239", "Q16334298", "Q21871294", "Q420", "Q28598684", "Q864928", "Q2996394", "Q64732777", "Q12136", "Q2057971", "Q4936952", "Q11190"], blurb: "Living things and the study of them." },
  COSMOS: { name: "Cosmos", c1: "#7b6cff", c2: "#2b2190", g: "planet", roots: ["Q6999", "Q17444909", "Q333", "Q131565179"], blurb: "Space: stars, planets, galaxies, astronomy." },
  REALM: { name: "Realm", c1: "#2fc4b2", c2: "#0e6a60", g: "mountain", roots: ["Q2221906", "Q618123", "Q82794", "Q56061", "Q1071", "Q8008", "Q1069"], blurb: "Places on Earth: countries, cities, landforms, geography." },
  MATTER: { name: "Matter", c1: "#b8c4d6", c2: "#46536d", g: "atom", roots: ["Q11344", "Q79529", "Q11173", "Q7946", "Q214609", "Q43460564", "Q35758", "Q2329", "Q11790203"], blurb: "Stuff: elements, compounds, materials, chemistry." },
  EVENT: { name: "Event", c1: "#d8b07a", c2: "#77511f", g: "hourglass", roots: ["Q1190554", "Q1656682", "Q13418847", "Q180684", "Q309", "Q3241045"], blurb: "Things that happened: wars, revolutions, disasters, history." },
  CULTURE: { name: "Culture", c1: "#ff8a4c", c2: "#963709", g: "note", roots: ["Q17537576", "Q838948", "Q34770", "Q9174", "Q386724", "Q43229", "Q16334295", "Q34749", "Q80083", "Q12909644", "Q273005", "Q28108", "Q638", "Q735", "Q7748", "Q483394", "Q921513", "Q82799", "Q159810", "Q1920219", "Q367293"], blurb: "What people share: languages, religions, arts, groups, economies, laws." },
  CRAFT: { name: "Craft", c1: "#4ea4ff", c2: "#164c94", g: "nut", roots: ["Q16686448", "Q11016", "Q39546", "Q7397", "Q42889", "Q11019", "Q1183543", "Q11023", "Q21198", "Q28797"], blurb: "What people make: tools, machines, buildings, software." },
  FORCE: { name: "Force", c1: "#ff5252", c2: "#8a1414", g: "bolt", roots: ["Q11402", "Q104934", "Q11379", "Q1293220", "Q1322005", "Q483247", "Q3249551", "Q413", "Q4162444", "Q33104303", "Q107715", "Q9357058", "Q214070", "Q17320256", "Q37172", "Q395", "Q1936384", "Q24034552", "Q246672", "Q11563", "Q815741", "Q65943", "Q976981", "Q20026918", "Q186509", "Q36161"], blurb: "Physics and maths: forces, energy, quantities, the laws of nature." },
  MIND: { name: "Mind", c1: "#c07bff", c2: "#561c96", g: "eye", roots: ["Q5891", "Q22811234", "Q33104279", "Q5389993", "Q2915955", "Q12765852", "Q1387659", "Q117850", "Q49447", "Q9418", "Q147638", "Q96634632", "Q3968640", "Q12047513", "Q12047512", "Q781413", "Q13434561", "Q9415", "Q205555", "Q450", "Q2145290", "Q131841", "Q9420", "Q194112", "Q55387456", "Q151885", "Q17737", "Q7184903", "Q7048977", "Q11862829", "Q1047113"], blurb: "Philosophy and psychology: thoughts, feelings, values, consciousness." },
  WILD: { name: "Wild", c1: "#8d96a8", c2: "#383f50", g: "compass", roots: [], blurb: "Not placed yet: the open record doesn't say what kind of thing it is." }
};
var TYPE_ORDER = ["MYTH", "FIGURE", "LIFE", "COSMOS", "REALM", "MATTER", "EVENT", "CULTURE", "CRAFT", "FORCE", "MIND"];
var ROOT_COST = { Q1190554: 3, Q483247: 3, Q3249551: 3, Q7048977: 3, Q16686448: 3, Q16334298: 4, Q21871294: 4, Q386724: 2, Q1293220: 2, Q1322005: 2, Q43229: 1, Q16334295: 2, Q64728693: 2, Q864928: 1, Q64732777: 1, Q80083: 1, Q28797: 1, Q17320256: 1, Q36161: 1, Q1387659: 1, Q117850: 1, Q49447: 1, Q151885: 2, Q17737: 3, Q7184903: 3, Q11862829: 4, Q1047113: 4, Q483394: 1, Q367293: 1, Q246672: 1, Q131841: 2, Q2145290: 2, Q1920219: 2 };
var TOP = new Set("Q35120 Q488383 Q4406616 Q7048977 Q7184903 Q6502323 Q99527517".split(" "));
var RARITY = [
  { key: "iconic", name: "Iconic", min: 120, gems: "\u25C9", color: "#ffe7a3", rank: 0 },
  { key: "common", name: "Common", min: 50, gems: "\u25CF", color: "#cfd6ee", rank: 1 },
  { key: "uncommon", name: "Uncommon", min: 20, gems: "\u25C6", color: "#7fe3d4", rank: 2 },
  { key: "rare", name: "Rare", min: 8, gems: "\u2605", color: "#6d9cff", rank: 3 },
  { key: "epic", name: "Epic", min: 3, gems: "\u2605\u2605", color: "#c07bff", rank: 4 },
  { key: "legendary", name: "Legendary", min: 1, gems: "\u2605\u2605\u2605", color: "#ff9f43", rank: 5 },
  { key: "mythic", name: "Mythic", min: 0, gems: "\u2726", color: "#ff5fb0", rank: 6 }
];
var REL_PROPS = "P171 P279 P31 P361 P1269 P527 P186 P2670 P150 P1056 P2974 P183 P9714 P276 P131 P17 P30 P706 P703 P1582 P1441 P1080 P8345 P206 P376 P59 P397 P195 P61 P170 P50 P138 P495 P19 P144 P737 P155 P112 P84 P828 P366 P1542 P2283 P1552 P129 P2175 P3780 P800 P106 P1535 P156 P2789 P460 P1889 P461 P1382 P3373 P2579 P101 P921 P425".split(" ");
var typeOf = (k2) => TYPES[k2] || TYPES.WILD;
function rarityFor(n) {
  return RARITY.find((r) => n >= r.min) || RARITY[RARITY.length - 1];
}
function rarityByKey(k2) {
  return RARITY.find((r) => r.key === k2) || RARITY[1];
}
var cardIdFor = (qid) => `card-${qid}`;
var itemIds = (list) => (list || []).filter((c) => c.rank !== "deprecated").map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
var cap = (s) => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s;
function classify(S, nodes, hints) {
  const p31 = S.p31 || [];
  const anywhere = (T2) => (TYPES[T2].hard || TYPES[T2].roots).some((r) => r === S.qid || nodes[r] || p31.includes(r));
  if (anywhere("MYTH")) return "MYTH";
  if (anywhere("FIGURE")) return "FIGURE";
  if (hints.taxon) return "LIFE";
  const D2 = { [S.qid]: 0 };
  const queue = [];
  for (const q2 of hints.up || p31) if (D2[q2] == null) {
    D2[q2] = 1;
    queue.push(q2);
  }
  while (queue.length) {
    const x = queue.shift();
    for (const p of Object.keys(nodes[x]?.parents || {})) if (D2[p] == null) {
      D2[p] = D2[x] + 1;
      queue.push(p);
    }
  }
  let best = null;
  let bd = 1e9;
  const offer = (T2, d) => {
    if (d < bd || d === bd && TYPE_ORDER.indexOf(T2) < TYPE_ORDER.indexOf(best)) {
      best = T2;
      bd = d;
    }
  };
  if (hints.atomic || hints.formula) offer("MATTER", 1);
  if (hints.at) offer("EVENT", 1);
  for (const T2 of TYPE_ORDER) for (const r of TYPES[T2].roots) if (D2[r] != null) offer(T2, D2[r] + (ROOT_COST[r] || 0));
  return best || (hints.coord ? "REALM" : "WILD");
}
function buildLadder(S, nodes) {
  const choose = (ps) => {
    const c = ps.filter((p) => nodes[p]);
    if (!c.length) return null;
    c.sort((a, b2) => (nodes[b2].n > 0) - (nodes[a].n > 0) || nodes[b2].n - nodes[a].n);
    return c[0];
  };
  const chain = [{ qid: S.qid, label: S.label }];
  const seen = /* @__PURE__ */ new Set([S.qid]);
  let cur = choose(S.direct || []);
  while (cur && !seen.has(cur) && chain.length < 40) {
    seen.add(cur);
    chain.push({ qid: cur, label: nodes[cur].label });
    if (TOP.has(cur)) break;
    cur = choose(Object.keys(nodes[cur].parents || {}));
  }
  return chain.reverse().filter((r) => r.qid === S.qid || !/^Q\d+$/.test(r.label));
}
function cardFromSpecimen(entity, nodes, { summary = null, now } = {}) {
  const claims = entity.claims || {};
  const S = {
    qid: entity.id,
    label: entity.labels?.en?.value || entity.id,
    desc: entity.descriptions?.en?.value || "",
    sitelinks: Object.keys(entity.sitelinks || {}).length
  };
  S.isTaxon = !!claims.P171;
  const via = itemIds(claims.P171).length ? "P171" : itemIds(claims.P279).length ? "P279" : "P31";
  S.direct = itemIds(claims[via]);
  S.p31 = itemIds(claims.P31);
  const hints = { taxon: !!(claims.P171 || claims.P225), atomic: !!claims.P1086, formula: !!claims.P274, coord: !!claims.P625, at: !!claims.P585, up: itemIds(claims.P31).concat(itemIds(claims.P279)) };
  const ladder = buildLadder(S, nodes);
  const kind = classify(S, nodes, hints);
  const bonds = new Set(REL_PROPS.flatMap((p) => itemIds(claims[p])).filter((q2) => q2 !== S.qid)).size;
  const img = (claims.P18 || []).map((c) => c.mainsnak?.datavalue?.value).find((v2) => typeof v2 === "string");
  const sentence = String(summary?.extract || "").split(/(?<=\.)\s/)[0] || S.desc;
  return {
    id: cardIdFor(S.qid),
    type: "card",
    qid: S.qid,
    label: cap(S.label),
    desc: S.desc || void 0,
    kind,
    subtitle: cap(ladder.length > 1 ? ladder[ladder.length - 2].label : S.desc.split(/[,;(]/)[0]) || void 0,
    rarity: rarityFor(S.sitelinks).key,
    sitelinks: S.sitelinks,
    img: img ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img.replace(/ /g, "_"))}?width=500` : void 0,
    lineage: ladder.slice(-5, -1).map((r) => cap(r.label)),
    stats: { depth: Math.max(0, ladder.length - 1), bonds, reach: S.sitelinks },
    flavor: sentence ? sentence.slice(0, 170) : void 0,
    links: [
      entity.sitelinks?.enwiki?.title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.enwiki.title.replace(/ /g, "_"))}` : null,
      `https://www.wikidata.org/wiki/${S.qid}`
    ].filter(Boolean),
    added: now,
    updated: now,
    body: ""
  };
}
var WD_API = "https://www.wikidata.org/w/api.php";
var WDQS = "https://query.wikidata.org/sparql";
var WP_REST = "https://en.wikipedia.org/api/rest_v1/page/summary/";
var UA = typeof window === "undefined" ? { "User-Agent": "LivingResearch/1.0 (https://github.com/sandstormveg/Journal_system)" } : {};
async function getJSON(fetchImpl, url, timeout = 15e3) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json", ...UA }, signal: ctl?.signal });
    if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
    return await res.json();
  } finally {
    if (t) clearTimeout(t);
  }
}
async function fetchCard(qid, { fetchImpl = fetch, now } = {}) {
  const ent = await getJSON(fetchImpl, `${WD_API}?action=wbgetentities&format=json&origin=*&ids=${qid}&props=labels|descriptions|claims|sitelinks&languages=en&languagefallback=1`);
  const e = ent.entities && Object.values(ent.entities)[0];
  if (!e || e.missing !== void 0) throw new Error(`No such item: ${qid}`);
  const taxon = !!e.claims?.P171;
  const q2 = taxon ? `SELECT ?a ?aLabel ?p ?n WHERE { wd:${e.id} wdt:P171* ?a . OPTIONAL { ?a wdt:P171 ?p } OPTIONAL { ?a wikibase:sitelinks ?n } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }` : `SELECT ?a ?aLabel ?p ?n WHERE { wd:${e.id} (wdt:P31|wdt:P279)/wdt:P279* ?a . OPTIONAL { ?a wdt:P279 ?p } OPTIONAL { ?a wikibase:sitelinks ?n } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 3000`;
  const nodes = {};
  try {
    const rows = (await getJSON(fetchImpl, `${WDQS}?format=json&query=${encodeURIComponent(q2)}`, 25e3)).results?.bindings || [];
    for (const r of rows) {
      const a = r.a.value.split("/").pop();
      const N2 = nodes[a] ||= { label: r.aLabel ? r.aLabel.value : a, n: r.n ? +r.n.value : 0, parents: {} };
      if (r.p) N2.parents[r.p.value.split("/").pop()] = 1;
    }
  } catch {
  }
  let summary = null;
  const title = e.sitelinks?.enwiki?.title;
  if (title) {
    try {
      summary = await getJSON(fetchImpl, WP_REST + encodeURIComponent(title.replace(/ /g, "_")));
    } catch {
    }
  }
  return cardFromSpecimen(e, nodes, { summary, now });
}

// src/core/writing.js
var PIECE_STATUSES = { idea: "Idea", drafting: "Drafting", review: "In review", done: "Done" };
function makePiece(fields = {}, { now, author = "self" } = {}) {
  return {
    id: fields.id || newId("w", now),
    type: "piece",
    title: String(fields.title || "").trim() || "Untitled piece",
    status: PIECE_STATUSES[fields.status] ? fields.status : "idea",
    board: fields.board || void 0,
    task: fields.task || void 0,
    sources: fields.sources?.length ? [...new Set(fields.sources)] : void 0,
    cards: fields.cards?.length ? [...new Set(fields.cards)] : void 0,
    author,
    created: now,
    updated: now,
    visibility: "private",
    body: String(fields.body || "")
  };
}
function wordCount(text) {
  return (String(text || "").match(/[\p{L}\p{N}'’-]+/gu) || []).length;
}

// src/core/atlas.js
var atlasCardId = (id) => `card-atlas-${id}`;
function searchAtlas(index, query, { limit = 12 } = {}) {
  const entries = index?.entries || [];
  const q2 = fold(String(query || "").trim()).replace(/[-_]+/g, " ");
  if (!q2) return [];
  const words = q2.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of entries) {
    const name2 = fold(e.name).replace(/[-_]+/g, " ");
    const id = fold(e.id).replace(/[-_]+/g, " ");
    const rest = fold([e.summary, e.address?.domain, e.type].join(" ")).replace(/[-_]+/g, " ");
    let s = 0;
    if (name2 === q2 || id === q2) s += 100;
    else if (name2.startsWith(q2)) s += 40;
    for (const w2 of words) {
      if (name2.split(" ").some((t) => t.startsWith(w2))) s += 10;
      else if (id.includes(w2)) s += 6;
      else if (rest.includes(w2)) s += 2;
      else {
        s = 0;
        break;
      }
    }
    if (s > 0) scored.push([s, e]);
  }
  return scored.sort((a, b2) => b2[0] - a[0] || a[1].name.localeCompare(b2[1].name)).slice(0, limit).map(([, e]) => e);
}
function cardFromAtlas(e, { now, version } = {}) {
  return {
    id: atlasCardId(e.id),
    type: "card",
    source: "atlas",
    atlas: e.id,
    label: e.name,
    desc: e.summary || void 0,
    kind: e.type,
    address: e.address && Object.keys(e.address).length ? { ...e.address } : void 0,
    status: e.status || void 0,
    standing: e.standing || void 0,
    credence: typeof e.credence === "number" ? e.credence : void 0,
    review: e.review || void 0,
    path: e.path || void 0,
    edges: e.links?.length ? e.links.map((l) => [...l]) : void 0,
    sprite: e.sprite || void 0,
    atlas_version: version || void 0,
    added: now,
    updated: now,
    body: ""
  };
}
function refreshAtlasCard(existing, e, { now, version } = {}) {
  const fresh = cardFromAtlas(e, { now, version });
  if (!existing) return fresh;
  return { ...fresh, body: existing.body, added: existing.added || fresh.added };
}
var readable = (s) => String(s || "").replace(/_/g, " ");

// tools/research.mjs
var AUTHOR = "claude";
function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k2 = a.slice(2);
      const v2 = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[k2] = v2;
    } else out._.push(a);
  }
  return out;
}
function walk(root, dir = "") {
  const out = [];
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const name2 of readdirSync(abs)) {
    if (name2 === ".git" || name2 === "node_modules") continue;
    const rel2 = dir ? `${dir}/${name2}` : name2;
    if (statSync(path.join(root, rel2)).isDirectory()) out.push(...walk(root, rel2));
    else out.push(rel2);
  }
  return out;
}
function loadAll(root) {
  const records = [];
  const problems = [];
  for (const dir of ["sources", "boards", "cards", "writing"]) {
    for (const rel2 of walk(root, dir)) {
      if (!isRecordPath(rel2)) continue;
      try {
        const rec = parse(rel2, readFileSync(path.join(root, rel2), "utf8"));
        if (rec.deleted) continue;
        rec._path = rel2;
        records.push(rec);
      } catch (err) {
        problems.push({ path: rel2, message: err.message });
      }
    }
  }
  return { records, problems };
}
function loadAtlas(root, dir) {
  const tried = [dir, process.env.ATLAS_DIR, path.join(root, "..", "..", "atlas_infodex"), path.join(root, "..", "atlas_infodex"), path.join(root, "atlas_infodex")].filter(Boolean);
  for (const d of tried) {
    const f = path.join(path.resolve(root, d), "generated", "infodex-index.json");
    if (existsSync(f)) {
      try {
        return { index: JSON.parse(readFileSync(f, "utf8")), file: f };
      } catch (err) {
        return { error: `${f}: ${err.message}` };
      }
    }
  }
  return { error: "No Atlas index found. Clone sandstormveg/atlas_infodex next to tasks-data (or pass --atlas-dir), and run `npm run build` there if generated/infodex-index.json is missing." };
}
function loadSources(root) {
  const { records, problems } = loadAll(root);
  const sources = records.filter((r) => r.type === "source");
  sources.sort((a, b2) => String(b2.added || "").localeCompare(String(a.added || "")));
  return { sources, problems };
}
var line = (s) => {
  const by = [formatAuthors(s.authors), s.year].filter(Boolean).join(", ");
  const tags = (s.tags || []).map((t) => `#${t}`).join(" ");
  return `[${STATUSES[s.status] || s.status}]${s.favourite ? " \u2B50" : ""} ${s.title || s.url}${by ? ` \u2014 ${by}` : ""}${s.site ? ` \xB7 ${s.site}` : ""}${tags ? ` \xB7 ${tags}` : ""}  (${s.id})`;
};
function describe(s) {
  const out = [
    `# ${s.title || s.url}`,
    "",
    `- id: ${s.id}`,
    `- status: ${STATUSES[s.status] || s.status}${s.favourite ? " \xB7 \u2B50 favourite" : ""}`,
    `- kind: ${KINDS[s.kind] || s.kind}`
  ];
  if (s.url) out.push(`- link: ${s.url}`);
  if (s.doi) out.push(`- doi: ${s.doi}`);
  if (s.authors?.length) out.push(`- authors: ${s.authors.join(", ")}`);
  if (s.year) out.push(`- year: ${s.year}`);
  if (s.tags?.length) out.push(`- tags: ${s.tags.map((t) => `#${t}`).join(" ")}`);
  for (const m of (s.media || []).filter((x) => x.type === "photo")) out.push(`- picture: ${m.path}${m.width ? ` (${m.width}\xD7${m.height})` : ""} \u2014 open this file to see it`);
  for (const m of (s.media || []).filter((x) => x.type === "file")) out.push(`- file: ${m.path}${m.original_name ? ` (${m.original_name})` : ""} \u2014 kept as it is; open it to read`);
  out.push(`- saved: ${String(s.added || "").slice(0, 10)}${s.started ? ` \xB7 started ${String(s.started).slice(0, 10)}` : ""}${s.finished ? ` \xB7 finished ${String(s.finished).slice(0, 10)}` : ""}`);
  if (s.why) out.push("", "## Why I saved it", s.why);
  if (s.expect) out.push("", "## What I expected it to argue", s.expect);
  if (s.surprised) out.push("", "## What surprised me", s.surprised);
  if (s.quotes?.length) out.push("", "## Quotes", ...s.quotes.map((q2) => `> ${q2.text}${q2.where ? ` (${q2.where})` : ""}`));
  if (String(s.body || "").trim()) out.push("", "## Notes", s.body.trim());
  if (s.assist === true || s.prompt) {
    out.push("", `## Assist \u2014 ${s.assist === true ? "on" : "off"}${assistWaiting(s) ? " \xB7 waiting for an answer" : ""}`);
    if (s.prompt) out.push(`Their prompt${s.prompted ? ` (${String(s.prompted).slice(0, 16).replace("T", " ")})` : ""}:`, s.prompt.trim());
  }
  if (s.agent_notes?.length) out.push("", "## Agent notes", ...s.agent_notes.map((n) => `- ${String(n.date).slice(0, 16).replace("T", " ")} \xB7 ${n.author}: ${n.text}`));
  return out.join("\n");
}
function save(root, rec) {
  const rel2 = pathFor(rec);
  mkdirSync(path.dirname(path.join(root, rel2)), { recursive: true });
  writeFileSync(path.join(root, rel2), serialize(rec));
  return rel2;
}
function run(argv, { cwd = process.cwd(), now = isoLocal(/* @__PURE__ */ new Date(), deviceTimeZone()), print = console.log } = {}) {
  const a = args(argv);
  const root = path.resolve(cwd, typeof a.data === "string" ? a.data : ".");
  const [cmd, ...rest] = a._;
  const { records, problems } = loadAll(root);
  const sources = records.filter((r) => r.type === "source").sort((a2, b2) => String(b2.added || "").localeCompare(String(a2.added || "")));
  const byType = (t) => records.filter((r) => r.type === t);
  const cards = Object.fromEntries(byType("card").map((c) => [c.id, c]));
  const sourcesById = Object.fromEntries(sources.map((x) => [x.id, x]));
  const lookups = { cards, sources: sourcesById };
  const findBoard = (q2) => byType("board").find((b2) => b2.id === q2) || (q2 ? byType("board").find((b2) => fold(b2.title).includes(fold(q2))) : null);
  const findPiece = (q2) => byType("piece").find((x) => x.id === q2) || (q2 ? byType("piece").find((x) => fold(x.title).includes(fold(q2))) : null);
  const pinName = (p) => p ? p.title || cards[p.card]?.label || sourcesById[p.source]?.title || String(p.body || "").split("\n")[0].slice(0, 60) || PIN_KINDS[p.kind] : "?";
  const by = (r) => r.author && r.author !== "self" ? ` (by ${r.author === "claude" || r.author === "claude-code" ? "Claude" : r.author})` : "";
  const str = (v2) => typeof v2 === "string" ? v2 : "";
  const json = (v2) => print(JSON.stringify(v2, (k2, x) => k2 === "_path" ? void 0 : x, 2));
  const find = (q2) => sources.find((s) => s.id === q2) || (q2 ? searchSources(sources, q2)[0] : null);
  switch (cmd) {
    case "list": {
      let list = sources;
      if (a.status) list = list.filter((s) => s.status === a.status);
      if (a.tag) list = list.filter((s) => (s.tags || []).includes(String(a.tag).replace(/^#/, "")));
      if (a.fav) list = list.filter((s) => s.favourite);
      if (a.kind) list = list.filter((s) => s.kind === a.kind);
      list = list.slice(0, Number(a.limit) || 200);
      if (a.json) return json(list);
      print(list.length ? list.map(line).join("\n") : "Nothing matches.");
      return list;
    }
    case "search": {
      const found = searchSources(sources, rest.join(" "));
      if (a.json) return json(found);
      print(found.length ? found.map(line).join("\n") : "Nothing matches.");
      return found;
    }
    case "show": {
      const s = find(rest.join(" "));
      if (!s) {
        print("No source matches that.");
        return null;
      }
      if (a.json) return json(s);
      print(describe(s));
      return s;
    }
    case "tags": {
      const t = tagCounts(sources);
      if (a.json) return json(t);
      print(t.length ? t.map(([k2, n]) => `#${k2}  ${n}`).join("\n") : "No tags yet.");
      return t;
    }
    case "stats": {
      const by2 = Object.fromEntries(Object.keys(STATUSES).map((k2) => [k2, sources.filter((s) => s.status === k2).length]));
      const month = String(now).slice(0, 7);
      const stats = { total: sources.length, ...by2, favourites: sources.filter((s) => s.favourite).length, finished_this_month: sources.filter((s) => String(s.finished || "").startsWith(month)).length, top_tags: tagCounts(sources).slice(0, 10) };
      if (a.json) return json(stats);
      print([
        `${stats.total} sources: ${Object.entries(by2).map(([k2, n]) => `${STATUSES[k2]} ${n}`).join(" \xB7 ")}`,
        `\u2B50 ${stats.favourites} favourites \xB7 ${stats.finished_this_month} finished this month`,
        stats.top_tags.length ? `Top tags: ${stats.top_tags.map(([k2, n]) => `#${k2} (${n})`).join(", ")}` : ""
      ].filter(Boolean).join("\n"));
      return stats;
    }
    case "add": {
      const link = rest[0];
      if (!link && !a.title) {
        print("Usage: add <link> [--title \u2026] [--tags a,b] [--why \u2026]");
        return null;
      }
      const dup = findDuplicate(sources, { url: link, doi: a.doi });
      if (dup) {
        print(`Already saved: ${line(dup)}`);
        return dup;
      }
      if (link && !normalizeUrl(link)) {
        print(`That doesn't look like a web link: ${link}`);
        return null;
      }
      if (a.status && !STATUSES[a.status]) {
        print(`Unknown status "${a.status}". Use: ${Object.keys(STATUSES).join(", ")}`);
        return null;
      }
      const rec = makeSource({
        url: link,
        title: typeof a.title === "string" ? a.title : "",
        doi: typeof a.doi === "string" ? a.doi : void 0,
        kind: typeof a.kind === "string" && KINDS[a.kind] ? a.kind : void 0,
        status: a.status || "inbox",
        tags: typeof a.tags === "string" ? a.tags.split(",") : [],
        why: typeof a.why === "string" ? a.why : ""
      }, { now, via: "claude" });
      const errors = validateRecord(rec);
      if (errors.length) {
        print(`Not saved: ${errors.join("; ")}`);
        return null;
      }
      const rel2 = save(root, rec);
      print(`Saved to ${STATUSES[rec.status]}: ${line(rec)}
${rel2}`);
      return rec;
    }
    case "set": {
      const s = sources.find((x) => x.id === rest[0]);
      if (!s) {
        print(`No source with id ${rest[0]}.`);
        return null;
      }
      let next = { ...s };
      if (a.status) {
        if (!STATUSES[a.status]) {
          print(`Unknown status "${a.status}".`);
          return null;
        }
        next = { ...next, ...statusPatch(next, a.status, now) };
      }
      if (a.fav !== void 0) next.favourite = a.fav === true || a.fav === "true";
      if (typeof a.tags === "string") {
        const tags = new Set(next.tags || []);
        for (const t of a.tags.split(",")) {
          const [op, name2] = /^[+-]/.test(t) ? [t[0], t.slice(1)] : ["+", t];
          const clean2 = cleanTags([name2])[0];
          if (!clean2) continue;
          if (op === "-") tags.delete(clean2);
          else tags.add(clean2);
        }
        next.tags = [...tags];
      }
      next.updated = now;
      delete next._path;
      save(root, next);
      print(`Updated: ${line(next)}`);
      return next;
    }
    case "assists": {
      const list = a.all ? sources.filter((x) => x.assist === true) : assistQueue(sources);
      if (a.json) return json(list);
      print(list.length ? list.map((x) => `${line(x)}${assistWaiting(x) ? "" : "  (answered)"}
    \u2192 ${String(x.prompt || "(no prompt yet)").trim().split("\n")[0].slice(0, 160)}`).join("\n") : a.all ? "No source has Assist on." : "No prompts waiting.");
      return list;
    }
    case "agent-note": {
      const s = sources.find((x) => x.id === rest[0]);
      const text = str(a.text) || rest.slice(1).join(" ");
      if (!s || !text.trim()) {
        print('Usage: agent-note <source id> --text "\u2026"');
        return null;
      }
      if (s.assist !== true) {
        print(`Assist is off for ${s.id} \u2014 the owner hasn't asked for an agent here.`);
        return null;
      }
      const note = makeAgentNote(text, { author: str(a.author) || AUTHOR, now });
      const next = { ...s, agent_notes: [...s.agent_notes || [], note], updated: now };
      delete next._path;
      save(root, next);
      print(`Agent note added to ${s.title || s.id}.`);
      return note;
    }
    case "deposit": {
      const text = [str(a.title), rest.join(" ")].filter(Boolean).join("\n").trim();
      if (!text) {
        print("Usage: deposit <text or link> [--title \u2026] [--tags a,b]");
        return null;
      }
      const shared = parseShared({ text: rest.join(" "), title: str(a.title) });
      const tags = str(a.tags) ? a.tags.split(",") : [];
      if (shared.url || shared.doi) {
        const dup = findDuplicate(sources, { url: shared.url, doi: shared.doi });
        if (dup) {
          print(`Already saved: ${line(dup)}`);
          return dup;
        }
      }
      const first = text.split("\n")[0];
      const rec = shared.url || shared.doi ? makeSource({ url: shared.url || `https://doi.org/${shared.doi}`, title: shared.title, doi: shared.doi || void 0, tags }, { now, via: "claude" }) : makeSource({ kind: "thought", title: first.length > 120 ? `${first.slice(0, 117)}\u2026` : first, body: text === first && first.length <= 120 ? "" : text, tags }, { now, via: "claude" });
      const rel2 = save(root, rec);
      print(`In the Deposit: ${line(rec)}
${rel2}`);
      return rec;
    }
    case "boards": {
      const boards = byType("board").sort((x, y2) => String(y2.updated || "").localeCompare(String(x.updated || "")));
      const out = boards.map((b2) => ({ ...b2, summary: boardSummary(boardParts(records, b2.id)) }));
      if (a.json) return json(out);
      print(out.length ? out.map((b2) => `${b2.title} \u2014 ${b2.summary.pins} pins \xB7 ${b2.summary.red} red \xB7 ${b2.summary.synthesised} synthesised${b2.piece ? ` \xB7 for \u201C${findPiece(b2.piece)?.title || b2.piece}\u201D` : ""}${by(b2)}  (${b2.id})`).join("\n") : "No boards yet.");
      return out;
    }
    case "board":
    case "curate": {
      const b2 = findBoard(rest.join(" "));
      if (!b2) {
        print("No board matches that. Try `boards`.");
        return null;
      }
      const parts = boardParts(records, b2.id);
      const cur = curate(parts, lookups);
      const pinsById = Object.fromEntries(parts.pins.map((p) => [p.id, p]));
      if (a.json) return json({ board: b2, ...parts, curator: cur });
      const out = [];
      if (cmd === "board") {
        const sum = boardSummary(parts);
        out.push(`# ${b2.title}`, "", `- id: ${b2.id}${b2.about ? `
- about: ${b2.about}` : ""}${b2.piece ? `
- for: ${findPiece(b2.piece)?.title || b2.piece}` : ""}`, `- ${sum.pins} pins \xB7 ${sum.frames} frames \xB7 ${sum.red} red \xB7 ${sum.synthesised} synthesised \xB7 ${sum.loose} not connected`);
        const frames = parts.pins.filter((p) => p.kind === "frame");
        const items = parts.pins.filter((p) => p.kind !== "frame");
        const pinLine = (p) => {
          const first = String(p.body || "").split("\n").find(Boolean) || "";
          const cc = cards[p.card];
          const extra = p.kind === "card" ? cc?.source === "atlas" ? ` \u2014 Atlas ${readable(cc.kind)}${cc.address?.domain ? `, ${readable(cc.address.domain)}` : ""}${cc.status ? `, ${readable(cc.status)}` : ""}` : ` \u2014 ${typeOf(cc?.kind).name}, ${rarityByKey(cc?.rarity).name}` : p.kind === "source" && sourcesById[p.source]?.url ? ` \u2014 ${sourcesById[p.source].url}` : p.url ? ` \u2014 ${p.url}` : "";
          return `- [${p.kind}] ${pinName(p)}${extra}${first && first !== p.title ? `: ${first.slice(0, 140)}` : ""}${by(p)}  (${p.id})`;
        };
        for (const f of frames) {
          const inside2 = items.filter((p) => framesOf(p, parts.pins)[0]?.id === f.id);
          const ad = f.address ? ` [${Object.values(f.address).join(" \xB7 ")}]` : "";
          out.push("", `## Frame: ${f.title || "untitled"}${ad}  (${f.id})`, ...inside2.length ? inside2.map(pinLine) : ["(empty)"]);
        }
        const free = items.filter((p) => !framesOf(p, parts.pins).length);
        if (free.length) out.push("", frames.length ? "## Not in a frame" : "## Pins", ...free.map(pinLine));
        if (parts.strings.length) {
          out.push("", "## Strings");
          for (const t of parts.strings) {
            const ends = `${pinName(pinsById[t.from])} \u2014 ${pinName(pinsById[t.to])}`;
            if (t.state === "synthesised") out.push(`- \u2501 ${ends}${t.label ? ` \xB7 ${t.label}` : ""}: \u201C${t.body}\u201D${t.tier ? ` [${TIERS[t.tier]?.name || t.tier}${t.holds_in ? `; holds in: ${t.holds_in}` : ""}${t.breaks_at ? `; breaks at: ${t.breaks_at}` : ""}]` : ""}  (${t.id})`);
            else out.push(`- \u3030 ${ends}${t.label ? ` \xB7 ${t.label}` : ""} \u2014 red, not synthesised${by(t)}  (${t.id})`);
          }
        }
        out.push("");
      }
      out.push("## Curator", ...cur.findings.length ? cur.findings.map((f) => `- ${f.level === "info" ? "" : f.level === "warn" ? "\u26A0 " : "check: "}${f.text}`) : ["- Nothing to check."]);
      if (cur.insights.length) out.push("", "## Most surprising connections", ...cur.insights.map((x) => `- ${pinName(pinsById[x.from])} \u2014 ${pinName(pinsById[x.to])}: surprise ${x.score} (structural ${x.structural}, lexical ${x.lexical}, domain ${x.domain})`));
      print(out.join("\n"));
      return { board: b2, ...parts, curator: cur };
    }
    case "new-board": {
      const title = rest.join(" ").trim();
      if (!title) {
        print("Usage: new-board <title> [--about \u2026] [--piece w-\u2026]");
        return null;
      }
      const piece = str(a.piece) ? findPiece(a.piece) : null;
      if (str(a.piece) && !piece) {
        print(`No piece ${a.piece}.`);
        return null;
      }
      const b2 = makeBoard({ title, about: str(a.about), piece: piece?.id }, { now, author: AUTHOR });
      save(root, b2);
      if (piece && !piece.board) {
        const next = { ...piece, board: b2.id, updated: now };
        delete next._path;
        save(root, next);
      }
      print(`New board: ${b2.title}  (${b2.id})`);
      return b2;
    }
    case "pin": {
      const b2 = findBoard(rest[0]);
      if (!b2) {
        print(`No board ${rest[0] || ""}. Try \`boards\`.`);
        return null;
      }
      const kind = str(a.kind) || (a.card ? "card" : a.source ? "source" : a.url ? "link" : "note");
      if (!PIN_KINDS[kind]) {
        print(`Kind must be one of: note, link, quote, source, card, frame.`);
        return null;
      }
      if (kind === "frame" && !str(a.title)) {
        print("A frame needs --title (and ideally --domain).");
        return null;
      }
      if (kind === "source" && !sourcesById[a.source]) {
        print(`No source ${a.source || ""} in the library \u2014 add it first (add / deposit).`);
        return null;
      }
      let cardId = kind === "card" ? str(a.atlas) ? atlasCardId(a.atlas) : cardIdFor(String(a.card || "").toUpperCase()) : void 0;
      if (kind === "card" && str(a.atlas) && !cards[cardId]) {
        const { index, error } = loadAtlas(root, str(a["atlas-dir"]));
        const entry = index?.entries.find((e) => e.id === a.atlas);
        if (!entry) {
          print(error || `No Atlas entry "${a.atlas}". Try \`atlas <words>\`.`);
          return null;
        }
        const card = refreshAtlasCard(null, entry, { now, version: index.version });
        save(root, card);
        cards[card.id] = card;
        cardId = card.id;
      }
      if (kind === "card" && !cards[cardId]) {
        print(`No card ${a.card || ""} yet \u2014 run \`card ${a.card || "Q\u2026"}\` first (or pin an Atlas entry with --atlas <id>).`);
        return null;
      }
      if (!str(a.title) && !str(a.text) && kind !== "source" && kind !== "card") {
        print("A pin needs --title or --text.");
        return null;
      }
      const { pins } = boardParts(records, b2.id);
      const near = str(a.near) ? pins.find((p) => p.id === a.near) : null;
      if (str(a.near) && !near) {
        print(`No pin ${a.near} on ${b2.title}.`);
        return null;
      }
      const size = defaultSize(kind);
      const spot = placeNear(pins, { anchor: near, ...size });
      const at = kind === "frame" ? placeNear(pins.filter((p) => p.kind === "frame"), { ...size }) : near?.kind === "frame" ? placeNear(pins, { anchor: { x: near.x + 40, y: near.y + 40, w: size.w, h: size.h }, ...size, gap: 16 }) : spot;
      const address = kind === "frame" ? { domain: str(a.domain), perspective: str(a.perspective), scale: str(a.scale), time: str(a.time) } : void 0;
      const pin = makePin({ board: b2.id, kind, title: str(a.title) || (kind === "card" ? cards[cardId].label : kind === "source" ? sourcesById[a.source].title : void 0), text: str(a.text), url: str(a.url) || void 0, source: kind === "source" ? a.source : void 0, card: cardId, address, ...at }, { now, author: AUTHOR });
      const errors = validateRecord(pin);
      if (errors.length) {
        print(`Not pinned: ${errors.join("; ")}`);
        return null;
      }
      const rel2 = save(root, pin);
      print(`Pinned to ${b2.title}: [${kind}] ${pinName(pin)}  (${pin.id})
${rel2}`);
      return pin;
    }
    case "connect": {
      const b2 = findBoard(rest[0]);
      if (!b2) {
        print(`No board ${rest[0] || ""}.`);
        return null;
      }
      const { pins, strings } = boardParts(records, b2.id);
      const [from, to] = [rest[1], rest[2]].map((id) => pins.find((p) => p.id === id));
      if (!from || !to) {
        print(`Both pins must be on ${b2.title}: ${rest[1] || "?"}, ${rest[2] || "?"}.`);
        return null;
      }
      if (from.id === to.id) {
        print("A string needs two different pins.");
        return null;
      }
      if (strings.some((t2) => t2.from === from.id && t2.to === to.id || t2.from === to.id && t2.to === from.id)) {
        print("They're already connected.");
        return null;
      }
      const t = makeString({ board: b2.id, from: from.id, to: to.id, label: str(a.label) }, { now, author: AUTHOR });
      save(root, t);
      print(`Red string: ${pinName(from)} \u2014 ${pinName(to)}${t.label ? ` \xB7 ${t.label}` : ""} (not synthesised \u2014 only the owner synthesises)  (${t.id})`);
      return t;
    }
    case "atlas": {
      const { index, error, file } = loadAtlas(root, str(a["atlas-dir"]));
      if (!index) {
        print(error);
        return null;
      }
      const q2 = rest.join(" ");
      if (!q2) {
        print(`Atlas index: ${index.count} entries, version ${index.version} (${file}). Search it: atlas <words>`);
        return index;
      }
      const found = searchAtlas(index, q2, { limit: Number(a.limit) || 10 });
      if (a.json) return json(found);
      print(found.length ? found.map((e) => `${e.id} \u2014 ${e.name} (${[readable(e.type), readable(e.address?.domain), e.status && readable(e.status)].filter(Boolean).join(" \xB7 ")}): ${e.summary}`).join("\n") : "Nothing in the Atlas matches.");
      return found;
    }
    case "card": {
      if (str(a.atlas)) {
        const { index, error } = loadAtlas(root, str(a["atlas-dir"]));
        const entry = index?.entries.find((e) => e.id === a.atlas);
        if (!entry) {
          print(error || `No Atlas entry "${a.atlas}".`);
          return null;
        }
        const card = refreshAtlasCard(cards[atlasCardId(entry.id)], entry, { now, version: index.version });
        save(root, card);
        print(`Atlas card: ${card.label} \u2014 ${readable(card.kind)}${card.address?.domain ? `, ${readable(card.address.domain)}` : ""}  (${card.id})`);
        return card;
      }
      const qid = String(rest[0] || "").toUpperCase();
      if (!/^Q\d+$/.test(qid)) {
        const list = Object.values(cards);
        if (a.json) return json(list);
        print(list.length ? list.map((c) => `${c.label} \u2014 ${typeOf(c.kind).name}, ${rarityByKey(c.rarity).name}  (${c.qid})`).join("\n") : "No cards yet. `card Q\u2026` makes one from Wikidata.");
        return list;
      }
      const have = cards[cardIdFor(qid)];
      const show = (c) => print([
        `# ${c.label} (${c.qid})`,
        `- ${typeOf(c.kind).name} \xB7 ${rarityByKey(c.rarity).name} \xB7 depth ${c.stats?.depth ?? "?"} \xB7 ${c.stats?.bonds ?? "?"} bonds \xB7 ${c.stats?.reach ?? c.sitelinks ?? "?"} Wikipedias`,
        c.lineage?.length ? `- lineage: ${c.lineage.join(" \u203A ")}` : "",
        c.desc ? `- ${c.desc}` : "",
        c.questions?.length ? `
## Questions (from the Dex)
${c.questions.map((q2) => `- ${q2}`).join("\n")}` : "",
        String(c.body || "").trim() ? `
## The owner's entries
${c.body.trim()}` : ""
      ].filter(Boolean).join("\n"));
      if (have) {
        if (a.json) return json(have);
        show(have);
        return have;
      }
      return fetchCard(qid, { now }).then(
        (c) => {
          save(root, c);
          if (a.json) return json(c);
          show(c);
          print(`
Saved ${pathFor(c)}`);
          return c;
        },
        (err) => {
          print(`Couldn't make the card: ${err.message}`);
          return null;
        }
      );
    }
    case "pieces": {
      const list = byType("piece").sort((x, y2) => String(y2.updated || "").localeCompare(String(x.updated || "")));
      if (a.json) return json(list);
      print(list.length ? list.map((x) => `[${PIECE_STATUSES[x.status] || x.status}] ${x.title} \u2014 ${wordCount(x.body)} words${x.board ? ` \xB7 board ${x.board}` : ""}${x.task?.title ? ` \xB7 task: ${x.task.title}` : ""}  (${x.id})`).join("\n") : "No writing yet.");
      return list;
    }
    case "piece": {
      const x = findPiece(rest.join(" "));
      if (!x) {
        print("No piece matches that. Try `pieces`.");
        return null;
      }
      if (a.json) return json(x);
      const sum = x.board ? boardSummary(boardParts(records, x.board)) : null;
      print([
        `# ${x.title}`,
        "",
        `- id: ${x.id}`,
        `- status: ${PIECE_STATUSES[x.status] || x.status} \xB7 ${wordCount(x.body)} words`,
        x.task?.title ? `- task: ${x.task.title}${x.task.id ? ` (${x.task.id})` : ""}` : "",
        sum ? `- board: ${x.board} \u2014 ${sum.pins} pins, ${sum.red} red, ${sum.synthesised} synthesised` : "- no board yet",
        x.sources?.length ? `- sources: ${x.sources.map((sid) => sourcesById[sid]?.title || sid).join("; ")}` : "",
        "",
        "## Draft (the owner's words \u2014 read and quote, never edit)",
        String(x.body || "").trim() || "(empty)"
      ].filter((l) => l !== "").join("\n"));
      return x;
    }
    case "new-piece": {
      const title = rest.join(" ").trim();
      if (!title) {
        print("Usage: new-piece <title> [--task-id \u2026 --task-title \u2026]");
        return null;
      }
      const task = str(a["task-id"]) || str(a["task-title"]) ? { id: str(a["task-id"]) || void 0, title: str(a["task-title"]) || void 0 } : void 0;
      const piece = makePiece({ title, task }, { now, author: AUTHOR });
      const b2 = makeBoard({ title, piece: piece.id, about: "The thinking behind this piece" }, { now, author: AUTHOR });
      piece.board = b2.id;
      save(root, piece);
      save(root, b2);
      print(`New piece: ${piece.title}  (${piece.id}) \u2014 its board ${b2.id}. The draft is empty: it's the owner's to write.`);
      return { piece, board: b2 };
    }
    case "validate": {
      const errors = [...problems.map((p) => `${p.path}: ${p.message}`)];
      for (const r of records) for (const e of validateRecord(r)) errors.push(`${r._path}: ${e}`);
      print(errors.length ? errors.join("\n") : `OK \u2014 ${sources.length} sources, ${byType("board").length} boards, ${byType("pin").length} pins, ${byType("string").length} strings, ${byType("card").length} cards, ${byType("piece").length} pieces.`);
      return errors;
    }
    default:
      print(`Research tool. Commands:
Library:   list [--status inbox|to-read|reading|read|dropped|filed] [--tag t] [--fav] [--kind k] [--limit n]
           search <words or #tags> \xB7 show <id | words> \xB7 tags \xB7 stats
           add <link> [--title \u2026] [--tags a,b] [--why \u2026] [--status \u2026] [--kind \u2026] [--doi \u2026]
           deposit <text or link> [--title \u2026] [--tags a,b]
           set <id> [--status \u2026] [--fav true|false] [--tags +a,-b]
Assist:    assists [--all] \xB7 agent-note <id> --text "\u2026" [--author \u2026]   (only where the owner turned Assist on)
Boards:    boards \xB7 board <id | words> \xB7 curate <board>
           new-board <title> [--about \u2026] [--piece w-\u2026]
           pin <board> --title \u2026 [--text \u2026] [--kind note|link|quote|source|card] [--url \u2026] [--source s-\u2026] [--card Q\u2026] [--near p-\u2026]
           pin <board> --kind frame --title \u2026 [--domain \u2026] [--perspective \u2026] [--scale \u2026] [--time \u2026]   (then --near <frame> to pin inside it)
           connect <board> <pin> <pin> [--label \u2026]
           card [Q\u2026] \xB7 card --atlas <entry-id>
Atlas:     atlas <words> [--atlas-dir <clone of atlas_infodex>] \u2014 searches its small index, never the whole repo
           pin <board> --kind card --atlas <entry-id>
Writing:   pieces \xB7 piece <id | words> \xB7 new-piece <title> [--task-id \u2026 --task-title \u2026]
           validate
Options: --data <dir>, --json
You (Claude) may pin and tie red string, marked as yours. Never synthesise a string, write a draft, or edit the owner's pins, notes or card entries.`);
      return null;
  }
}
var isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) Promise.resolve(run(process.argv.slice(2))).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
export {
  describe,
  loadAll,
  loadAtlas,
  loadSources,
  run
};
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.0 https://github.com/nodeca/js-yaml @license MIT *)
*/
