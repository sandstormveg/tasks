#!/usr/bin/env node
// Living Journal steward tool — bundled from sandstormveg/Journal_system (tools/journal.mjs). inputs:923fc4ce79053627
// Do not edit here; rebuild with `npm run bundle-cli` in the app repository.

// tools/journal.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

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
  report: ["id", "type", "kind", "created", "summary"]
};
var SEALED_NOTE = "_Sealed entry: its text is encrypted with your journal passphrase._";
var BODY_TYPES = /* @__PURE__ */ new Set(["entry", "day", "claim", "interpretation", "report", "proposal", "question"]);
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
    case "config":
      return rec.id.startsWith("config:") ? `config/${rec.id.slice(7)}.yaml` : null;
    default:
      return null;
  }
}
var TEXT_PREFIXES = ["entries/", "days/", "events/", "meta/claims/", "meta/proposals/", "meta/questions/", "interpretations/", "imports/", "config/"];
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
    const name = path2.slice(7).replace(/\.yaml$/, "");
    return { ...data2, id: `config:${name}`, type: "config" };
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
  if (path2.startsWith("config/")) return "config";
  return null;
}
function idFromPath(path2) {
  const file = path2.split("/").pop();
  if (path2.startsWith("config/")) return `config:${file.replace(/\.yaml$/, "")}`;
  return file.replace(/\.md$/, "");
}

// src/core/dates.js
var DEFAULT_ROLLOVER_HOUR = 4;
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
function dayKey(date = /* @__PURE__ */ new Date(), tz = deviceTimeZone(), rolloverHour = DEFAULT_ROLLOVER_HOUR) {
  const shifted = new Date(date.getTime() - rolloverHour * 36e5);
  const p = wallParts(shifted, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
function parseDayKey(key) {
  const [y2, m, d] = key.split("-").map(Number);
  return { year: y2, month: m, day: d };
}
function dayToDate(key) {
  const { year, month, day } = parseDayKey(key);
  return new Date(Date.UTC(year, month - 1, day, 12));
}
function dateToDay(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function addDays(key, n) {
  const d = dayToDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToDay(d);
}
function daysBetween(a, b2) {
  return Math.round((dayToDate(b2) - dayToDate(a)) / 864e5);
}
function compareDays(a, b2) {
  return a < b2 ? -1 : a > b2 ? 1 : 0;
}

// src/core/model.js
var RECORD_TYPES = ["entry", "day", "event", "claim", "proposal", "question", "interpretation", "config", "report"];
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
function nowIso(tz = deviceTimeZone()) {
  return isoLocal(/* @__PURE__ */ new Date(), tz);
}
function build(defaults, fields, type) {
  const out = { ...defaults };
  for (const [k2, v2] of Object.entries(fields || {})) if (v2 !== void 0) out[k2] = v2;
  for (const k2 of Object.keys(out)) if (out[k2] === void 0) delete out[k2];
  out.type = type;
  return out;
}
function makeProposal(fields, { now = nowIso() } = {}) {
  return build({
    id: newId("p", now),
    op: "add-claim",
    status: "pending",
    created: now,
    author: "ai",
    evidence: [],
    alternatives: []
  }, fields, "proposal");
}
function aiReadable(rec) {
  if (!rec || rec.deleted) return false;
  if (rec.privacy === "no-ai" || rec.privacy === "sealed" || rec.sealed) return false;
  if (rec.kind === "document" && rec.document && rec.document.ai_allowed === false) return false;
  return true;
}
function entryText(e) {
  if (!e) return "";
  const parts = [];
  if (e.title) parts.push(e.title);
  if (e.body) parts.push(e.body);
  for (const m of e.media || []) if (m.caption) parts.push(m.caption);
  if (e.document) {
    if (e.document.title) parts.push(e.document.title);
    if (e.document.text) parts.push(e.document.text);
  }
  return parts.join("\n\n");
}
function dayText(d) {
  if (!d) return "";
  return [d.best && `Best: ${d.best}`, d.hardest && `Hardest: ${d.hardest}`, d.body].filter(Boolean).join("\n");
}
function normRating(day) {
  if (!day || day.rating == null || day.rating === "") return null;
  const v2 = Number(day.rating);
  const scale = Number(day.rating_scale) || 10;
  if (!Number.isFinite(v2)) return null;
  const min = scale === 5 || scale === 10 ? 1 : 0;
  return Math.max(0, Math.min(1, (v2 - min) / (scale - min)));
}
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

// src/core/stats.js
function coverage(entries, { from, to } = {}) {
  const ds = entries.map((e) => e.day).filter(Boolean).filter((d) => (!from || compareDays(d, from) >= 0) && (!to || compareDays(d, to) <= 0)).sort();
  if (!ds.length) return { entries: 0, days: 0, from: from || null, to: to || null, longestGap: null, weekly: [], note: "No entries in this period." };
  const start = from || ds[0];
  const end = to || ds[ds.length - 1];
  const uniq = [...new Set(ds)];
  let longestGap = 0, gapFrom = null;
  const consider = (g, fromDay) => {
    if (g > longestGap) {
      longestGap = g;
      gapFrom = fromDay;
    }
  };
  consider(daysBetween(start, uniq[0]), start);
  for (let i = 1; i < uniq.length; i++) consider(daysBetween(uniq[i - 1], uniq[i]) - 1, addDays(uniq[i - 1], 1));
  consider(daysBetween(uniq[uniq.length - 1], end), addDays(uniq[uniq.length - 1], 1));
  const span = daysBetween(start, end) + 1;
  const weeks = Math.max(1, Math.ceil(span / 7));
  const weekly = new Array(weeks).fill(0);
  for (const d of ds) weekly[Math.min(weeks - 1, Math.floor(daysBetween(start, d) / 7))]++;
  const density = uniq.length / span;
  let note = `${ds.length} entr${ds.length === 1 ? "y" : "ies"} on ${uniq.length} of ${span} days.`;
  if (longestGap >= 14) note += ` Longest gap: ${longestGap} days from ${gapFrom} \u2014 less writing, not necessarily less happening.`;
  else if (density < 0.3) note += " Sparse coverage: treat patterns here as rough.";
  return { entries: ds.length, days: uniq.length, span, from: start, to: end, longestGap, gapFrom, weekly, density, note };
}

// src/core/context.js
var clip = (s, n) => s.length > n ? s.slice(0, n) + "\u2026" : s;
var attr = (s) => String(s ?? "").replace(/"/g, "'").replace(/\s+/g, " ").trim();
function gate(entries) {
  const included = [];
  const excluded = { noAi: 0, sealed: 0, documents: 0, deleted: 0 };
  for (const e of entries) {
    if (e.deleted) {
      excluded.deleted++;
      continue;
    }
    if (e.privacy === "sealed" || e.sealed) {
      excluded.sealed++;
      continue;
    }
    if (e.privacy === "no-ai") {
      excluded.noAi++;
      continue;
    }
    if (!aiReadable(e)) {
      excluded.documents++;
      continue;
    }
    included.push(e);
  }
  return { included, excluded };
}
function buildContext(allEntries, opts = {}) {
  const { from, to, maxChars = 15e4, perEntryMax = 6e3 } = opts;
  let pool = allEntries.filter((e) => e.type === "entry");
  if (opts.ids) {
    const want = new Set(opts.ids);
    pool = pool.filter((e) => want.has(e.id));
  } else {
    pool = pool.filter((e) => (!from || compareDays(e.day, from) >= 0) && (!to || compareDays(e.day, to) <= 0));
  }
  const { included, excluded } = gate(pool);
  const newestFirst = [...included].sort((a, b2) => String(b2.created).localeCompare(String(a.created)));
  const parts = [];
  let used = 0;
  const kept = [];
  let truncated = 0;
  for (const e of newestFirst) {
    const text2 = clip(entryText(e), perEntryMax);
    const tags = (e.tags || []).join(",");
    const block = `<entry id="${e.id}" day="${e.day}" time="${(e.created || "").slice(11, 16)}" kind="${e.kind}"${tags ? ` tags="${attr(tags)}"` : ""}${e.kind === "document" && e.document?.author ? ` written_by="${attr(e.document.author)}"` : ""}>
${text2}
</entry>`;
    if (used + block.length > maxChars) {
      truncated++;
      continue;
    }
    used += block.length;
    parts.push(block);
    kept.push(e);
  }
  parts.reverse();
  const keptIds = new Set(kept.map((e) => e.id));
  const privateDays = new Set(allEntries.filter((e) => e.type === "entry" && !e.deleted && !aiReadable(e)).map((e) => e.day));
  const dayLines = [];
  excluded.days = 0;
  for (const d of opts.days || []) {
    if (from && compareDays(d.date, from) < 0 || to && compareDays(d.date, to) > 0) continue;
    if (privateDays.has(d.date)) {
      excluded.days++;
      continue;
    }
    if (d.rating == null && !d.best && !d.hardest && !(d.emotions || []).length) continue;
    const r = normRating(d) != null ? `${d.rating}/${d.rating_scale || 10}` : "not rated";
    dayLines.push(`<day date="${d.date}" rating="${r}"${d.best ? ` best="${attr(d.best)}"` : ""}${d.hardest ? ` hardest="${attr(d.hardest)}"` : ""}${(d.emotions || []).length ? ` feelings="${attr(d.emotions.join(", "))}"` : ""}/>`);
  }
  const claimLines = (opts.claims || []).filter((c) => c.status !== "retired").map((c) => `<claim id="${c.id}" section="${c.section}" confidence="${c.confidence}" status="${c.status}" origin="${c.origin}">${attr(c.statement)}</claim>`);
  const questionLines = (opts.questions || []).filter((q2) => q2.status === "open").map((q2) => `<question id="${q2.id}" kind="${q2.kind}">${attr(q2.text)}</question>`);
  const prefs = opts.prefs || {};
  const boundaries = [];
  if ((prefs.mutedTopics || []).length) boundaries.push(`Muted topics (do not raise): ${prefs.mutedTopics.map((t) => t.topic || t).join(", ")}`);
  if ((prefs.neverKinds || []).length) boundaries.push(`Never propose these kinds: ${prefs.neverKinds.join(", ")}`);
  const range = kept.length ? { from: kept.map((e) => e.day).sort()[0], to: kept.map((e) => e.day).sort().slice(-1)[0] } : { from, to };
  const cov = coverage(kept, { from: from || range.from, to: to || range.to });
  const text = [
    `<journal_context from="${range.from || ""}" to="${range.to || ""}" entries="${kept.length}" coverage="${attr(cov.note)}">`,
    ...parts,
    dayLines.length ? `<days>
${dayLines.join("\n")}
</days>` : "",
    "</journal_context>",
    claimLines.length ? `<meta_record>
${claimLines.join("\n")}
</meta_record>` : "<meta_record>(empty)</meta_record>",
    questionLines.length ? `<open_questions>
${questionLines.join("\n")}
</open_questions>` : "",
    boundaries.length ? `<boundaries>
${boundaries.join("\n")}
</boundaries>` : ""
  ].filter(Boolean).join("\n");
  return { text, includedIds: [...keptIds], excluded, truncated, range, coverage: cov, chars: text.length };
}

// src/core/metarecord.js
function normalizeQuoteText(s) {
  return String(s || "").normalize("NFC").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function sourceText(rec) {
  if (!rec) return "";
  if (rec.type === "entry") return entryText(rec);
  if (rec.type === "day") return dayText(rec);
  if (rec.type === "question") return rec.text || "";
  return rec.body || "";
}
function verifyEvidence(evidence, lookup) {
  return (evidence || []).map((ev) => {
    const ref = ev.entry || ev.ref || ev.day;
    const rec = ref ? lookup(ref) : void 0;
    if (!rec || rec.deleted) return { ...ev, verified: false, problem: "missing-source" };
    if (rec.type === "entry" && !aiReadable(rec)) return { ...ev, verified: false, problem: "private-source" };
    if (!ev.quote) return { ...ev, verified: false, problem: "no-quote" };
    const hay = normalizeQuoteText(sourceText(rec));
    const needle = normalizeQuoteText(ev.quote);
    if (needle.length < 3) return { ...ev, verified: false, problem: "quote-too-short" };
    return hay.includes(needle) ? { ...ev, verified: true } : { ...ev, verified: false, problem: "quote-not-found" };
  });
}
function calibration(proposals, { author } = {}) {
  const decided = proposals.filter((p) => (p.status === "accepted" || p.status === "corrected" || p.status === "rejected") && typeof p.predicted_acceptance === "number" && (!author || p.author === author));
  const n = decided.length;
  const outcomes = decided.map((p) => p.status === "rejected" ? 0 : 1);
  const preds = decided.map((p) => p.predicted_acceptance);
  if (!n) return { n: 0, note: "No decided proposals with a prediction yet." };
  const brier = preds.reduce((s, p, i) => s + (p - outcomes[i]) ** 2, 0) / n;
  const base = outcomes.reduce((a, b2) => a + b2, 0) / n;
  const ref = base * (1 - base);
  const skill = ref > 0 ? 1 - brier / ref : null;
  const bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0001].slice(0, -1).map((lo, i, arr) => {
    const hi2 = [0.2, 0.4, 0.6, 0.8, 1.0001][i];
    const idx = preds.map((p, k2) => p >= lo && p < hi2 ? k2 : -1).filter((k2) => k2 >= 0);
    return { lo, hi: Math.min(1, hi2), n: idx.length, predicted: idx.length ? idx.reduce((s, k2) => s + preds[k2], 0) / idx.length : null, actual: idx.length ? idx.reduce((s, k2) => s + outcomes[k2], 0) / idx.length : null };
  });
  const meanPred = preds.reduce((a, b2) => a + b2, 0) / n;
  let note;
  if (n < 10) note = `Only ${n} decided proposal${n === 1 ? "" : "s"} \u2014 too few to judge calibration.`;
  else if (meanPred - base > 0.15) note = "Overconfident: proposals are taken up less often than predicted.";
  else if (base - meanPred > 0.15) note = "Underconfident: proposals are taken up more often than predicted.";
  else note = "Predictions roughly match how often you take proposals up.";
  const reasons = {};
  for (const p of decided) if (p.status === "rejected") {
    const r = p.decision?.reason || "unspecified";
    reasons[r] = (reasons[r] || 0) + 1;
  }
  return { n, brier, base, meanPred, skill, bins, note, reasons };
}
function surprises(claims, proposals) {
  const out = [];
  const active = new Map(claims.filter((c) => c.status !== "retired").map((c) => [c.id, c]));
  for (const p of proposals) {
    if (p.status !== "pending") continue;
    const claim = p.target ? active.get(p.target) : null;
    for (const ev of p.evidence || []) {
      if (ev.stance === "contradicts") out.push({ proposal: p, claim, evidence: ev });
    }
  }
  for (const c of active.values()) {
    for (const ev of c.evidence || []) if (ev.stance === "contradicts") out.push({ proposal: null, claim: c, evidence: ev });
  }
  return out;
}
function reviewQueue(proposals, nowIsoStr) {
  return proposals.filter((p) => p.status === "pending" || p.status === "deferred" && (!p.snooze_until || p.snooze_until <= nowIsoStr)).sort((a, b2) => String(b2.created).localeCompare(String(a.created)));
}

// tools/journal.mjs
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
  for (const name of readdirSync(abs)) {
    if (name === ".git" || name === "node_modules") continue;
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(path.join(root, rel)).isDirectory()) out.push(...walk(root, rel));
    else out.push(rel);
  }
  return out;
}
function loadRepo(root) {
  const records = /* @__PURE__ */ new Map();
  const problems = [];
  for (const rel of walk(root)) {
    if (!isRecordPath(rel)) continue;
    try {
      const rec = parse(rel, readFileSync(path.join(root, rel), "utf8"));
      rec._path = rel;
      if (records.has(rec.id)) problems.push({ path: rel, level: "error", message: `duplicate id ${rec.id} (also ${records.get(rec.id)._path})` });
      records.set(rec.id, rec);
    } catch (err) {
      problems.push({ path: rel, level: "error", message: `unreadable: ${err.message}` });
    }
  }
  const byType = (t) => [...records.values()].filter((r) => r.type === t);
  const prefs = records.get("config:preferences") || {};
  return { records, problems, byType, prefs };
}
function parseSince(s, today) {
  const m = /^(\d+)([dwmy])$/.exec(String(s || ""));
  if (!m) return null;
  const n = Number(m[1]) * { d: 1, w: 7, m: 30, y: 365 }[m[2]];
  return addDays(today, -n);
}
function validate(repo) {
  const out = [...repo.problems];
  const lookup = (id) => repo.records.get(id);
  for (const r of repo.records.values()) {
    for (const e of validateRecord(r)) out.push({ path: r._path, level: "error", message: e });
    const expected = pathFor(r);
    if (expected && expected !== r._path) out.push({ path: r._path, level: "warn", message: `expected at ${expected}` });
    if (r.type === "proposal") {
      if (r.target && !lookup(r.target)) out.push({ path: r._path, level: "error", message: `target ${r.target} not found` });
      if (r.status === "pending") {
        for (const ev of verifyEvidence(r.evidence, lookup)) {
          if (ev.problem === "private-source") out.push({ path: r._path, level: "error", message: `cites private entry ${ev.entry} \u2014 must not read No-AI or sealed entries` });
          else if (!ev.verified) out.push({ path: r._path, level: "warn", message: `evidence not verified (${ev.problem}): ${ev.entry} \u201C${String(ev.quote || "").slice(0, 60)}\u201D` });
        }
      }
    }
    if (r.type === "claim") {
      for (const ev of r.evidence || []) if (ev.entry && !lookup(ev.entry)) out.push({ path: r._path, level: "warn", message: `evidence entry ${ev.entry} not found` });
    }
  }
  return out;
}
function buildProposals(repo, items, { author = "claude-code", max = 5, now, from, to } = {}) {
  const lookup = (id) => repo.records.get(id);
  const prefs = repo.prefs || {};
  const muted = new Set((prefs.muted_topics || []).map((m) => m.topic || m));
  const never = new Set(prefs.never_kinds || []);
  const accepted = [];
  const rejected = [];
  for (const raw of items) {
    if (accepted.length >= max) {
      rejected.push({ item: raw, why: `over the budget of ${max}` });
      continue;
    }
    const op = raw.op;
    if (!PROPOSAL_OPS[op]) {
      rejected.push({ item: raw, why: `unknown op ${op}` });
      continue;
    }
    if ((op === "revise-claim" || op === "retire-claim") && !(raw.target && lookup(raw.target)?.type === "claim")) {
      rejected.push({ item: raw, why: "target claim not found" });
      continue;
    }
    if (raw.topic && muted.has(raw.topic)) {
      rejected.push({ item: raw, why: `topic "${raw.topic}" is muted` });
      continue;
    }
    if (never.has(raw.question_kind || raw.kind || op)) {
      rejected.push({ item: raw, why: "a kind the person asked never to raise" });
      continue;
    }
    const evidence = (raw.evidence || []).map((e) => ({ entry: e.entry, quote: e.quote, stance: e.stance || "supports" }));
    const checked = verifyEvidence(evidence, lookup);
    if (checked.some((e) => e.problem === "private-source")) {
      rejected.push({ item: raw, why: "cites a No-AI or sealed entry" });
      continue;
    }
    if (!checked.length || !checked.some((e) => e.verified)) {
      rejected.push({ item: raw, why: "no verifiable quote \u2014 every proposal needs at least one exact quote" });
      continue;
    }
    const section = SECTION_IDS.includes(raw.section) ? raw.section : "orientation";
    const payload = op === "add-question" ? { text: raw.question_text || raw.text, kind: raw.question_kind || raw.kind || "gap", topic: raw.topic || void 0, sensitivity: raw.sensitivity || "low" } : op === "link-entries" ? { entries: [...new Set(evidence.map((e) => e.entry))], note: raw.note || raw.rationale } : op === "retire-claim" ? { reason: raw.rationale } : { section, statement: raw.statement, confidence: raw.confidence || "tentative", expects: raw.expects || void 0, would_change_if: raw.would_change_if || void 0, topic: raw.topic || void 0 };
    if ((op === "add-claim" || op === "revise-claim") && !payload.statement) {
      rejected.push({ item: raw, why: "no statement" });
      continue;
    }
    if (op === "add-question" && !payload.text) {
      rejected.push({ item: raw, why: "no question text" });
      continue;
    }
    if ((op === "add-claim" || op === "revise-claim") && !(raw.alternatives || []).length) {
      rejected.push({ item: raw, why: "claims need at least one alternative explanation" });
      continue;
    }
    const p = Number(raw.predicted_acceptance);
    accepted.push(makeProposal({
      op,
      target: raw.target || void 0,
      author,
      payload,
      predicted_acceptance: Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : void 0,
      rationale: raw.rationale,
      evidence,
      alternatives: raw.alternatives || [],
      coverage: { from, to, entries: raw.coverage_entries, note: raw.coverage_note },
      source: { via: "steward" }
    }, { now }));
  }
  return { accepted, rejected };
}
function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0] || "help";
  const root = path.resolve(a.data || ".");
  const tz = a.tz || deviceTimeZone();
  const today = dayKey(/* @__PURE__ */ new Date(), tz, 0);
  const now = isoLocal(/* @__PURE__ */ new Date(), tz);
  const repo = loadRepo(root);
  const entries = repo.byType("entry");
  if (cmd === "status") {
    const proposals = repo.byType("proposal");
    const claims = repo.byType("claim");
    const qs = repo.byType("question");
    const cov = coverage(entries.filter(aiReadable), { from: parseSince("90d", today), to: today });
    console.log(`Journal at ${root}`);
    console.log(`  entries: ${entries.length} (${entries.filter((e) => !aiReadable(e)).length} private: No-AI, sealed or uncleared documents)`);
    console.log(`  days with ratings/moments: ${repo.byType("day").length}`);
    console.log(`  claims: ${claims.filter((c) => c.status !== "retired").length} active, ${claims.filter((c) => c.status === "retired").length} retired`);
    console.log(`  proposals: ${reviewQueue(proposals, today).length} awaiting review, ${proposals.filter((p) => p.status === "accepted" || p.status === "corrected").length} taken up, ${proposals.filter((p) => p.status === "rejected").length} rejected`);
    console.log(`  open questions: ${qs.filter((q2) => q2.status === "open").length}`);
    console.log(`  last 90 days (AI-readable): ${cov.note}`);
    const s = surprises(claims, proposals);
    if (s.length) console.log(`  contradicting evidence on claims: ${s.length}`);
    if (repo.problems.length) console.log(`  unreadable files: ${repo.problems.length} (run validate)`);
    return;
  }
  if (cmd === "context") {
    const from = a.from || parseSince(a.since || "30d", today);
    const to = a.to || today;
    const prefs = repo.prefs || {};
    const ctx = buildContext(entries, {
      from,
      to,
      maxChars: Number(a["max-chars"]) || 15e4,
      days: repo.byType("day"),
      claims: repo.byType("claim"),
      questions: repo.byType("question"),
      prefs: { mutedTopics: (prefs.muted_topics || []).map((m) => m.topic || m), neverKinds: prefs.never_kinds || [] }
    });
    process.stdout.write(ctx.text + "\n");
    process.stderr.write(`
[context] ${ctx.includedIds.length} entries ${ctx.range.from || ""}\u2192${ctx.range.to || ""}; excluded no-ai=${ctx.excluded.noAi} sealed=${ctx.excluded.sealed} documents=${ctx.excluded.documents}; truncated=${ctx.truncated}
`);
    return;
  }
  if (cmd === "propose") {
    const file = a._[1];
    if (!file) throw new Error("usage: journal propose <proposals.json> [--max 5]");
    const json = JSON.parse(readFileSync(file, "utf8"));
    const items = Array.isArray(json) ? json : json.proposals || [];
    const { accepted, rejected } = buildProposals(repo, items, { max: Number(a.max) || 5, now, from: a.from, to: a.to || today, author: a.author || "claude-code" });
    for (const p of accepted) {
      const rel = pathFor(p);
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), serialize(p));
      console.log(`wrote ${rel} (${p.op}${p.payload?.statement ? `: ${p.payload.statement.slice(0, 70)}` : p.payload?.text ? `: ${p.payload.text.slice(0, 70)}` : ""})`);
    }
    for (const r of rejected) console.log(`skipped: ${r.why} \u2014 ${JSON.stringify(r.item).slice(0, 120)}`);
    if (!accepted.length) console.log("No proposals written. (Writing none is a fine outcome when nothing is well supported.)");
    return;
  }
  if (cmd === "validate") {
    const issues = validate(repo);
    for (const i of issues) console.log(`${i.level.toUpperCase()} ${i.path}: ${i.message}`);
    const errors = issues.filter((i) => i.level === "error").length;
    console.log(`${repo.records.size} records checked: ${errors} error(s), ${issues.length - errors} warning(s).`);
    process.exitCode = errors ? 1 : 0;
    return;
  }
  if (cmd === "calibration") {
    const proposals = repo.byType("proposal");
    const authors = [...new Set(proposals.map((p) => p.author))];
    for (const au of [void 0, ...authors]) {
      const c = calibration(proposals, { author: au });
      if (!c.n) continue;
      console.log(`${au || "all authors"}: n=${c.n} brier=${c.brier.toFixed(3)} taken-up=${(c.base * 100).toFixed(0)}% predicted=${(c.meanPred * 100).toFixed(0)}% \u2014 ${c.note}`);
      if (Object.keys(c.reasons).length) console.log(`  rejection reasons: ${JSON.stringify(c.reasons)}`);
    }
    if (!proposals.length) console.log("No proposals yet.");
    return;
  }
  console.log(HELP);
}
var HELP = `journal \u2014 tools for a Living Journal data repository

  journal status                     what's here, what's awaiting review
  journal context --since 30d        privacy-gated text for an AI to read (also --from/--to, --max-chars)
  journal propose proposals.json     validate steward proposals and write them (--max 5)
  journal validate                   structure, references, quotes, privacy
  journal calibration                how well proposals predicted your decisions

  --data <dir>   journal repository (default: current directory)
  --tz <zone>    timezone for "today" (default: this machine's)`;
var isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`journal: ${err.message}`);
    process.exitCode = 1;
  }
}
export {
  buildProposals,
  loadRepo,
  validate
};
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.0 https://github.com/nodeca/js-yaml @license MIT *)
*/
