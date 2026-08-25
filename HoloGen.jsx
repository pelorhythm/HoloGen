// ============================================================
// HoloGen.jsx — SF風ホログラム計器をランダム生成するScriptUIパネル
// v0.1 (Phase 1: コア4種リング + カメラリグ + アニメーション)
//
// インストール: このファイルを
//   /Applications/Adobe After Effects <ver>/Scripts/ScriptUI Panels/
// にコピーして AE を再起動 → ウィンドウメニュー → HoloGen.jsx
//
// 注意: 生成される「HOLO_CTRL」レイヤーと各エフェクト名は
// エクスプレッションが名前参照しているため変更しないでください。
// ============================================================

#targetengine "HoloGen";

var HOLO = HOLO || {};

(function holoGenMain(thisObj) {

    HOLO.VERSION = "0.1.0";

    // ---------------------------------------------------------
    // シード付き乱数 (mulberry32) — 同じシードなら同じ結果
    // ---------------------------------------------------------
    function imul(a, b) {
        var ah = (a >>> 16) & 0xffff, al = a & 0xffff;
        var bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
        return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
    }

    function makeRng(seed) {
        var a = seed >>> 0;
        var next = function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = imul(t ^ (t >>> 15), t | 1);
            t = (t + imul(t ^ (t >>> 7), t | 61)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        return {
            next: next,
            range: function (lo, hi) { return lo + (hi - lo) * next(); },
            rint: function (lo, hi) { return Math.floor(lo + (hi - lo + 1) * next()); },
            pick: function (arr) { return arr[Math.floor(next() * arr.length) % arr.length]; },
            chance: function (p) { return next() < p; }
        };
    }

    // ---------------------------------------------------------
    // 小物ユーティリティ
    // ---------------------------------------------------------
    function pad3(n) { return (n < 10 ? "00" : (n < 100 ? "0" : "")) + n; }

    function uniqueCompName(base) {
        var names = {};
        for (var i = 1; i <= app.project.numItems; i++) names[app.project.item(i).name] = true;
        if (!names[base]) return base;
        var k = 2;
        while (names[base + "_" + k]) k++;
        return base + "_" + k;
    }

    function addEffect(layer, matchName, dispName) {
        var fx = layer.property("ADBE Effect Parade").addProperty(matchName);
        fx.name = dispName;
        return fx;
    }

    function addSlider(layer, dispName, val) {
        var fx = addEffect(layer, "ADBE Slider Control", dispName);
        fx.property(1).setValue(val);
        return fx;
    }

    function addColorCtrl(layer, dispName, rgb) {
        var fx = addEffect(layer, "ADBE Color Control", dispName);
        fx.property(1).setValue(rgb);
        return fx;
    }

    // ---------------------------------------------------------
    // ランダムパラメータ生成（ランダム生成ボタンの中身）
    // ---------------------------------------------------------
    HOLO.randomParams = function (seed, keep) {
        // keep: 色などランダム化しない既存設定を引き継ぐ
        var rng = makeRng(seed);
        keep = keep || {};
        return {
            seed: seed,
            ringCount: rng.rint(6, 14),
            baseRadius: Math.round(rng.range(260, 460)),
            spacing: Math.round(rng.range(22, 60)),
            speed: 100,
            flicker: Math.round(rng.range(20, 55)),
            breathe: Math.round(rng.range(5, 30)),
            orbitSpin: Math.round(rng.range(3, 12)),
            globalScale: 100,
            mainColor: keep.mainColor || [1, 1, 1],
            accentColor: keep.accentColor || [1, 1, 1],
            textColor: keep.textColor || [1, 1, 1],
            withCallouts: keep.withCallouts !== false,
            withGrid: keep.withGrid !== false,
            withDust: keep.withDust !== false,
            quality: keep.quality || "標準"
        };
    };

    // ---------------------------------------------------------
    // エクスプレッション（HOLO_CTRL への名前参照は固定名）
    // ---------------------------------------------------------
    var EXP = {
        spin: 'value + time * thisLayer.effect("Spin")(1) * (thisComp.layer("HOLO_CTRL").effect("Global Speed")(1) / 100);',
        ringOpacity:
            'var base = thisLayer.effect("Ring Opacity")(1);\n' +
            'var amt = clamp(thisComp.layer("HOLO_CTRL").effect("Flicker")(1) / 100, 0, 1);\n' +
            'posterizeTime(12);\n' +
            'seedRandom(index, false);\n' +
            'var f = 0.35 + 0.65 * random();\n' +
            'base * (1 - amt + amt * f);',
        rootScale:
            'var ctrl = thisComp.layer("HOLO_CTRL");\n' +
            'var amt = ctrl.effect("Breathe")(1) / 100;\n' +
            'var g = ctrl.effect("Global Scale")(1);\n' +
            'var s = g * (1 + amt * 0.06 * Math.sin(time * 1.4));\n' +
            '[s, s, s];',
        rootOrbit:
            'var ctrl = thisComp.layer("HOLO_CTRL");\n' +
            'value + time * ctrl.effect("Orbit Spin")(1) * (ctrl.effect("Global Speed")(1) / 100);',
        strokeMain: 'thisComp.layer("HOLO_CTRL").effect("Main Color")(1);',
        strokeAccent: 'thisComp.layer("HOLO_CTRL").effect("Accent Color")(1);',
        textFill:
            'var c = thisComp.layer("HOLO_CTRL").effect("Text Color")(1);\n' +
            'text.sourceText.style.setFillColor(c);',
        calloutOpacity:
            'var base = thisComp.layer("HOLO_CTRL").effect("Callout Opacity")(1);\n' +
            'posterizeTime(3);\n' +
            'seedRandom(index, false);\n' +
            'base * (random() < 0.88 ? 1 : 0.25);',
        gridOpacity: 'thisComp.layer("HOLO_CTRL").effect("Grid Opacity")(1);',
        dustOpacity:
            'var base = thisComp.layer("HOLO_CTRL").effect("Dust Opacity")(1);\n' +
            'posterizeTime(6);\n' +
            'seedRandom(index, false);\n' +
            'base * (0.55 + 0.45 * random());'
    };

    // ---------------------------------------------------------
    // リング要素グループを1つ作る
    // kind: "wire" | "tick" | "dot" | "arc"（メイン）
    //       "data" | "bars" | "tickfine" | "dotsparse"（装飾）
    // radiusOffset: レイヤーのRadiusスライダーからの半径ズレ(px)
    // ---------------------------------------------------------
    function sizeExpr(radiusOffset) {
        var off = Math.round(radiusOffset);
        return 'var r = (thisLayer.effect("Radius")(1) + (' + off + ')) * 2;\n[r, r];';
    }

    function groupSpinExpr(degPerSec) {
        var d = Math.round(degPerSec * 10) / 10;
        return 'value + time * (' + d + ') * (thisComp.layer("HOLO_CTRL").effect("Global Speed")(1) / 100);';
    }

    function addElementGroup(shapeLayer, kind, rng, radiusOffset, useAccent, groupSpin) {
        var contents = shapeLayer.property("ADBE Root Vectors Group");
        var grp = contents.addProperty("ADBE Vector Group");
        grp.name = kind;
        var inner = grp.property("ADBE Vectors Group");

        var ell = inner.addProperty("ADBE Vector Shape - Ellipse");
        ell.property("ADBE Vector Ellipse Size").expression = sizeExpr(radiusOffset);

        if (kind === "arc" || kind === "bars") {
            var trim = inner.addProperty("ADBE Vector Filter - Trim");
            var arcLen = (kind === "arc") ? rng.range(6, 26) : rng.range(1.5, 6);
            var arcStart = rng.range(0, 100 - arcLen);
            trim.property("ADBE Vector Trim Start").setValue(arcStart);
            trim.property("ADBE Vector Trim End").setValue(arcStart + arcLen);
        }

        var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").expression = useAccent ? EXP.strokeAccent : EXP.strokeMain;

        var dashes;
        if (kind === "wire") {
            stroke.property("ADBE Vector Stroke Width").setValue(rng.range(1.5, 3));
        } else if (kind === "tick") {
            // 太いストローク + 短い破線 = 目盛り
            stroke.property("ADBE Vector Stroke Width").setValue(rng.range(10, 24));
            dashes = stroke.property("ADBE Vector Stroke Dashes");
            dashes.addProperty("ADBE Vector Stroke Dash 1").setValue(rng.range(1.5, 3.5));
            dashes.addProperty("ADBE Vector Stroke Gap 1").setValue(rng.range(8, 28));
        } else if (kind === "tickfine") {
            // 細かい目盛り（短く高密度）
            stroke.property("ADBE Vector Stroke Width").setValue(rng.range(4, 8));
            dashes = stroke.property("ADBE Vector Stroke Dashes");
            dashes.addProperty("ADBE Vector Stroke Dash 1").setValue(rng.range(0.8, 1.6));
            dashes.addProperty("ADBE Vector Stroke Gap 1").setValue(rng.range(3, 8));
        } else if (kind === "dot") {
            // ラウンドキャップ + 長さ0の破線 = ドットの並び
            stroke.property("ADBE Vector Stroke Width").setValue(rng.range(4, 9));
            stroke.property("ADBE Vector Stroke Line Cap").setValue(2);
            dashes = stroke.property("ADBE Vector Stroke Dashes");
            dashes.addProperty("ADBE Vector Stroke Dash 1").setValue(0.1);
            dashes.addProperty("ADBE Vector Stroke Gap 1").setValue(rng.range(16, 48));
        } else if (kind === "dotsparse") {
            stroke.property("ADBE Vector Stroke Width").setValue(rng.range(2.5, 5));
            stroke.property("ADBE Vector Stroke Line Cap").setValue(2);
            dashes = stroke.property("ADBE Vector Stroke Dashes");
            dashes.addProperty("ADBE Vector Stroke Dash 1").setValue(0.1);
            dashes.addProperty("ADBE Vector Stroke Gap 1").setValue(rng.range(60, 140));
        } else if (kind === "data") {
            // 不均等な破線 = モールス信号風のデータストリーム
            stroke.property("ADBE Vector Stroke Width").setValue(rng.range(2.5, 5.5));
            dashes = stroke.property("ADBE Vector Stroke Dashes");
            dashes.addProperty("ADBE Vector Stroke Dash 1").setValue(rng.range(1.5, 4));
            dashes.addProperty("ADBE Vector Stroke Gap 1").setValue(rng.range(4, 10));
            dashes.addProperty("ADBE Vector Stroke Dash 2").setValue(rng.range(12, 30));
            dashes.addProperty("ADBE Vector Stroke Gap 2").setValue(rng.range(5, 14));
            dashes.addProperty("ADBE Vector Stroke Dash 3").setValue(rng.range(3, 8));
            dashes.addProperty("ADBE Vector Stroke Gap 3").setValue(rng.range(18, 46));
        } else if (kind === "arc") {
            stroke.property("ADBE Vector Stroke Width").setValue(rng.range(2.5, 7));
        } else if (kind === "bars") {
            // 短く太い輝度バー（アクセント）
            stroke.property("ADBE Vector Stroke Width").setValue(rng.range(6, 14));
        }

        if (kind === "arc" || kind === "bars") {
            // リピーターで弧/バーをコピー（barsは不等間隔でデータ感を出す）
            var rep = inner.addProperty("ADBE Vector Filter - Repeater");
            var copies = (kind === "arc") ? rng.rint(2, 4) : rng.rint(2, 5);
            rep.property("ADBE Vector Repeater Copies").setValue(copies);
            var repTr = rep.property("ADBE Vector Repeater Transform");
            repTr.property("ADBE Vector Repeater Position").setValue([0, 0]);
            var rot = (kind === "arc") ? (360 / copies) : rng.range(40, 150);
            repTr.property("ADBE Vector Repeater Rotation").setValue(rot);
        }

        // グループ単体の逆回転・差動回転（レイヤー回転に重なって機械っぽさが出る）
        if (groupSpin !== 0) {
            grp.property("ADBE Vector Transform Group")
                .property("ADBE Vector Rotation").expression = groupSpinExpr(groupSpin);
        }
        return grp;
    }

    // 装飾グループの種類プール
    var DECO_KINDS = ["data", "bars", "tickfine", "dotsparse"];

    // リングの中身（メイン要素 + 装飾）を組み立てる
    function buildRingGroups(lyr, type, rng) {
        // メイン要素（アクセント色はドット/円弧に確率で）
        var useAccent = (type === "dot" || type === "arc") && rng.chance(0.6);
        addElementGroup(lyr, type, rng, 0, useAccent, 0);

        // 装飾グループ 1〜2個: 半径を少しずらし、別速度で差動回転
        var decoCount = rng.chance(0.8) ? (rng.chance(0.45) ? 2 : 1) : 0;
        for (var d = 0; d < decoCount; d++) {
            var kind = DECO_KINDS[rng.rint(0, DECO_KINDS.length - 1)];
            var off = rng.range(10, 42) * (rng.chance(0.5) ? 1 : -1);
            var decoAccent = (kind === "bars") ? true : rng.chance(0.2);
            var gSpin = rng.chance(0.65) ? rng.range(3, 18) * (rng.chance(0.5) ? 1 : -1) : 0;
            addElementGroup(lyr, kind, rng, off, decoAccent, gSpin);
        }
    }

    // ---------------------------------------------------------
    // 既存リングレイヤーの種類変更（中身だけ作り直す）
    // 位置・エフェクト値・エクスプレッション・親子関係は保持される
    // ---------------------------------------------------------
    HOLO.parseRingComment = function (comment) {
        // "HOLO|ring|type=tick|seed=123" をパース
        var out = { isRing: false, type: null, seed: 0 };
        if (!comment || comment.indexOf("HOLO|ring") !== 0) return out;
        out.isRing = true;
        var m1 = comment.match(/type=([a-z]+)/);
        if (m1) out.type = m1[1];
        var m2 = comment.match(/seed=(\d+)/);
        if (m2) out.seed = parseInt(m2[1], 10);
        return out;
    };

    HOLO.rebuildRingType = function (lyr, newType) {
        var meta = HOLO.parseRingComment(lyr.comment);
        var contents = lyr.property("ADBE Root Vectors Group");
        while (contents.numProperties > 0) {
            contents.property(1).remove();
        }
        // レイヤー名＋新種類から決定的にシードを作る（同じ操作は同じ見た目）
        var subSeed = (meta.seed || 1) * 31;
        for (var i = 0; i < newType.length; i++) subSeed = (subSeed * 33 + newType.charCodeAt(i)) >>> 0;
        for (var j = 0; j < lyr.name.length; j++) subSeed = (subSeed * 33 + lyr.name.charCodeAt(j)) >>> 0;
        var rng = makeRng(subSeed);
        buildRingGroups(lyr, newType, rng);
        lyr.comment = "HOLO|ring|type=" + newType + "|seed=" + (meta.seed || 0);
    };

    // ---------------------------------------------------------
    // リングレイヤー1枚を生成
    // ---------------------------------------------------------
    HOLO.RING_TYPES = ["wire", "tick", "dot", "arc"];
    HOLO.TYPE_LABELS = { wire: "ワイヤー", tick: "目盛り", dot: "ドット", arc: "円弧" };

    function createRingLayer(comp, root, idx, type, params, rng) {
        var lyr = comp.layers.addShape();
        lyr.name = "HOLO_RING_" + pad3(idx + 1);
        lyr.comment = "HOLO|ring|type=" + type + "|seed=" + params.seed;
        lyr.threeDLayer = true;
        lyr.parent = root;

        // 積層位置: 中心からY方向へ対称に積む + 揺らぎ
        // （親ヌルのアンカーが[50,50]センターのため、+50が親空間の中心）
        var n = params.ringCount;
        var yOff = (idx - (n - 1) / 2) * params.spacing + rng.range(-6, 6);
        lyr.property("ADBE Transform Group").property("ADBE Position").setValue([50, 50 + yOff, 0]);
        lyr.property("ADBE Transform Group").property("ADBE Rotate X").setValue(90); // 水平に寝かす

        // 個別コントロール（パネル/タイムラインどちらからでも調整可）
        var radius = params.baseRadius * rng.range(0.25, 1.0);
        // ドーム感: 端のリングほど少し小さく
        var edge = Math.abs(idx - (n - 1) / 2) / Math.max(1, (n - 1) / 2);
        radius *= (1 - 0.35 * edge * edge);

        addSlider(lyr, "Radius", Math.round(radius));
        var spin = rng.range(2, 25) * (rng.chance(0.5) ? 1 : -1);
        addSlider(lyr, "Spin", Math.round(spin * 10) / 10);
        addSlider(lyr, "Ring Opacity", Math.round(rng.range(40, 100)));

        buildRingGroups(lyr, type, rng);

        // アニメーション
        lyr.property("ADBE Transform Group").property("ADBE Rotate Z").expression = EXP.spin;
        lyr.property("ADBE Transform Group").property("ADBE Opacity").expression = EXP.ringOpacity;

        return { layer: lyr, yOff: yOff, radius: Math.round(radius) };
    }

    // ---------------------------------------------------------
    // コールアウト（読み出しテキスト + ブラケット線）
    // ---------------------------------------------------------
    var CALLOUT_PREFIX = ["TRK", "THX", "NAV", "SYS", "OBJ", "SIG", "LNK", "PWR", "GRD", "AXM"];
    var CALLOUT_AXIS = ["X", "Y", "Z", "V", "T"];
    var CALLOUT_STATE = ["LOCK", "SCAN", "SYNC", "IDLE", "ACTV", "CAL"];

    function randomReadout(rng) {
        var num = rng.rint(0, 99);
        return CALLOUT_PREFIX[rng.rint(0, CALLOUT_PREFIX.length - 1)] + " " +
            (num < 10 ? "0" : "") + num + " - " +
            CALLOUT_AXIS[rng.rint(0, CALLOUT_AXIS.length - 1)] +
            String(Math.round(rng.range(0, 9.99) * 100) / 100) + " " +
            CALLOUT_STATE[rng.rint(0, CALLOUT_STATE.length - 1)];
    }

    function addLinePath(inner, vertices) {
        var sh = new Shape();
        sh.vertices = vertices;
        sh.closed = false;
        var pathGrp = inner.addProperty("ADBE Vector Shape - Group");
        pathGrp.property("ADBE Vector Shape").setValue(sh);
        return pathGrp;
    }

    function resetTransform3D(t) {
        t.property("ADBE Orientation").setValue([0, 0, 0]);
        t.property("ADBE Rotate X").setValue(0);
        t.property("ADBE Rotate Y").setValue(0);
        t.property("ADBE Rotate Z").setValue(0);
        t.property("ADBE Scale").setValue([100, 100, 100]);
    }

    function createCallout(comp, root, idx, params, rng, ringInfos) {
        // 取り付き先のリングを1本選ぶ
        var ri = ringInfos[rng.rint(0, ringInfos.length - 1)];
        var R = ri.radius + rng.range(-8, 8);
        var theta = rng.range(0, Math.PI * 2);

        // 追跡ヌル: リング本体にペアレント。リングが回転しても
        // 「当初指していた位置」に追従し続ける
        var anchor = comp.layers.addNull();
        anchor.name = "HOLO_ANCHOR_" + pad3(idx + 1);
        anchor.comment = "HOLO|anchor";
        anchor.threeDLayer = true;
        anchor.parent = ri.layer;
        var at = anchor.property("ADBE Transform Group");
        at.property("ADBE Position").setValue([R * Math.cos(theta), R * Math.sin(theta), 0]);
        resetTransform3D(at);
        anchor.enabled = false;
        anchor.shy = true;

        // テキスト: 追跡ヌルにペアレントし、リングの回転に完全追従させる
        // （取り付き点の radial 外側 + 上 に一定距離でオフセット → ラインの長さが一定に保たれる）
        var out = rng.range(60, 130);
        var up = rng.range(30, 90);
        var tpos = [out * Math.cos(theta), out * Math.sin(theta), up];

        var tl = comp.layers.addText(randomReadout(rng));
        tl.name = "HOLO_TEXT_" + pad3(idx + 1);
        tl.comment = "HOLO|callout|seed=" + params.seed;
        tl.threeDLayer = true;

        var td = tl.property("ADBE Text Properties").property("ADBE Text Document").value;
        td.resetCharStyle();
        td.font = "Menlo-Regular";
        td.fontSize = 13;
        td.tracking = 60;
        td.applyFill = true;
        td.fillColor = params.textColor;
        td.applyStroke = false;
        tl.property("ADBE Text Properties").property("ADBE Text Document").setValue(td);
        tl.property("ADBE Text Properties").property("ADBE Text Document").expression = EXP.textFill;

        tl.parent = anchor;
        var tt = tl.property("ADBE Transform Group");
        tt.property("ADBE Position").setValue(tpos);
        resetTransform3D(tt);
        tl.autoOrient = AutoOrientType.CAMERA_OR_POINT_OF_INTEREST; // 常にカメラへ正対
        tt.property("ADBE Opacity").expression = EXP.calloutOpacity;

        // リーダー線: 2Dレイヤーで「テキスト下線 → 追跡ヌル」を毎フレーム画面座標で結ぶ
        var ln = comp.layers.addShape();
        ln.name = "HOLO_TEXTLINE_" + pad3(idx + 1);
        ln.comment = "HOLO|calloutline";
        var lt = ln.property("ADBE Transform Group");
        lt.property("ADBE Position").setValue([0, 0]);
        var inner = ln.property("ADBE Root Vectors Group")
            .addProperty("ADBE Vector Group").property("ADBE Vectors Group");
        var pathGrp = inner.addProperty("ADBE Vector Shape - Group");
        pathGrp.property("ADBE Vector Shape").expression =
            'var a = thisComp.layer("' + tl.name + '");\n' +
            'var b = thisComp.layer("' + anchor.name + '");\n' +
            'var r = a.sourceRectAtTime(time, false);\n' +
            'var p0 = a.toComp([r.left + r.width, 7, 0]);\n' +
            'var p1 = a.toComp([r.left - 6, 7, 0]);\n' +
            'var p2 = b.toComp([0, 0, 0]);\n' +
            'createPath([fromComp(p0), fromComp(p1), fromComp(p2)], [], [], false);';
        var st = inner.addProperty("ADBE Vector Graphic - Stroke");
        st.property("ADBE Vector Stroke Width").setValue(1.5);
        st.property("ADBE Vector Stroke Color").expression = EXP.strokeMain;
        lt.property("ADBE Opacity").expression = EXP.calloutOpacity;
        return { text: tl, line: ln, anchor: anchor };
    }

    // ---------------------------------------------------------
    // グリッド平面 + 交点スティック
    // ---------------------------------------------------------
    function createGrid(comp, root, params, rng, gridCopies) {
        var spacing = 190;
        var half = (gridCopies - 1) / 2 * spacing;
        var ext = half + spacing;

        var grid = comp.layers.addShape();
        grid.name = "HOLO_GRID";
        grid.comment = "HOLO|grid";
        grid.threeDLayer = true;

        function lineSet(vertA, vertB, repPos) {
            var inner = grid.property("ADBE Root Vectors Group")
                .addProperty("ADBE Vector Group").property("ADBE Vectors Group");
            addLinePath(inner, [vertA, vertB]);
            var st = inner.addProperty("ADBE Vector Graphic - Stroke");
            st.property("ADBE Vector Stroke Width").setValue(1.5);
            st.property("ADBE Vector Stroke Color").expression = EXP.strokeMain;
            var rep = inner.addProperty("ADBE Vector Filter - Repeater");
            rep.property("ADBE Vector Repeater Copies").setValue(gridCopies);
            rep.property("ADBE Vector Repeater Offset").setValue(-(gridCopies - 1) / 2);
            var repTr = rep.property("ADBE Vector Repeater Transform");
            repTr.property("ADBE Vector Repeater Position").setValue(repPos);
        }
        lineSet([-ext, 0], [ext, 0], [0, spacing]);  // 横線をY方向に反復
        lineSet([0, -ext], [0, ext], [spacing, 0]);  // 縦線をX方向に反復

        grid.parent = root;
        var gt = grid.property("ADBE Transform Group");
        gt.property("ADBE Position").setValue([50, 50, 0]); // 親アンカー[50,50]がセンター
        gt.property("ADBE Rotate X").setValue(90);
        gt.property("ADBE Opacity").expression = EXP.gridOpacity;

        // 交点スティック: 十字に交差した2枚の縦向きレイヤー
        for (var s = 0; s < 2; s++) {
            var stick = comp.layers.addShape();
            stick.name = "HOLO_STICKS_" + (s + 1);
            stick.comment = "HOLO|sticks";
            stick.threeDLayer = true;
            var innerS = stick.property("ADBE Root Vectors Group")
                .addProperty("ADBE Vector Group").property("ADBE Vectors Group");
            addLinePath(innerS, [[0, 0], [0, -rng.range(28, 50)]]);
            var stS = innerS.addProperty("ADBE Vector Graphic - Stroke");
            stS.property("ADBE Vector Stroke Width").setValue(2);
            stS.property("ADBE Vector Stroke Color").expression = EXP.strokeAccent;
            var repS = innerS.addProperty("ADBE Vector Filter - Repeater");
            repS.property("ADBE Vector Repeater Copies").setValue(gridCopies);
            repS.property("ADBE Vector Repeater Offset").setValue(-(gridCopies - 1) / 2);
            repS.property("ADBE Vector Repeater Transform")
                .property("ADBE Vector Repeater Position").setValue([spacing, 0]);
            stick.parent = root;
            var stT = stick.property("ADBE Transform Group");
            stT.property("ADBE Position").setValue([50, 50, 0]); // 親アンカー[50,50]がセンター
            stT.property("ADBE Rotate Y").setValue(s * 90);
            stT.property("ADBE Opacity").expression = EXP.gridOpacity;
        }
    }

    // ---------------------------------------------------------
    // ダスト（塵・ボケ粒子）: 深度違いの点群レイヤー3枚
    // ---------------------------------------------------------
    function createDust(comp, idx, params, rng, dotCount) {
        var lyr = comp.layers.addShape();
        lyr.name = "HOLO_DUST_" + (idx + 1);
        lyr.comment = "HOLO|dust";
        lyr.threeDLayer = true;

        var contents = lyr.property("ADBE Root Vectors Group");
        var grp = contents.addProperty("ADBE Vector Group");
        grp.name = "Dust";
        var inner = grp.property("ADBE Vectors Group");

        for (var i = 0; i < dotCount; i++) {
            var dg = inner.addProperty("ADBE Vector Group");
            var dgi = dg.property("ADBE Vectors Group");
            var ell = dgi.addProperty("ADBE Vector Shape - Ellipse");
            var sz = rng.chance(0.85) ? rng.range(1.5, 4) : rng.range(6, 14); // たまに大きめのボケ
            ell.property("ADBE Vector Ellipse Size").setValue([sz, sz]);
            ell.property("ADBE Vector Ellipse Position").setValue(
                [rng.range(-1100, 1100), rng.range(-650, 650)]);
            var fill = dgi.addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").expression =
                rng.chance(0.25) ? EXP.strokeAccent : EXP.strokeMain;
            dg.property("ADBE Vector Transform Group")
                .property("ADBE Vector Group Opacity").setValue(rng.range(25, 95));
        }

        var t = lyr.property("ADBE Transform Group");
        t.property("ADBE Position").setValue([960, 540, -450 + idx * 450]);
        lyr.autoOrient = AutoOrientType.CAMERA_OR_POINT_OF_INTEREST; // 常にカメラへ正対
        t.property("ADBE Opacity").expression = EXP.dustOpacity;
        // ゆっくり漂う
        t.property("ADBE Position").expression =
            'var s = ' + (idx + 1) + ';\n' +
            'value + [Math.sin(time * 0.07 * s + s * 9) * 40, Math.cos(time * 0.05 * s + s * 3) * 25, 0];';
        return lyr;
    }

    // ---------------------------------------------------------
    // メイン生成
    // ---------------------------------------------------------
    HOLO.generate = function (params) {
        if (!app || !app.project) {
            alert("プロジェクトが開いていません。");
            return null;
        }
        app.beginUndoGroup("HoloGen 生成");
        var comp = null;
        try {
            var rng = makeRng(params.seed);

            comp = app.project.items.addComp(
                uniqueCompName("HOLO_" + params.seed), 1920, 1080, 1.0, 10, 30);
            comp.bgColor = [0, 0, 0];

            // ---- コントロールヌル ----
            var ctrl = comp.layers.addNull();
            ctrl.name = "HOLO_CTRL";
            ctrl.label = 14; // cyan
            ctrl.comment = "HOLO|ctrl|seed=" + params.seed + "|v=" + HOLO.VERSION;
            ctrl.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([50, 50]);
            ctrl.property("ADBE Transform Group").property("ADBE Position").setValue([960, 540]);
            ctrl.enabled = false; // 2Dレイヤーが3Dセットを分断しないよう非表示に
            addColorCtrl(ctrl, "Main Color", params.mainColor);
            addColorCtrl(ctrl, "Accent Color", params.accentColor);
            addColorCtrl(ctrl, "Text Color", params.textColor);
            addSlider(ctrl, "Global Speed", params.speed);
            addSlider(ctrl, "Flicker", params.flicker);
            addSlider(ctrl, "Breathe", params.breathe);
            addSlider(ctrl, "Orbit Spin", params.orbitSpin);
            addSlider(ctrl, "Global Scale", params.globalScale);
            addSlider(ctrl, "Callout Opacity", 75);
            addSlider(ctrl, "Grid Opacity", 14);
            addSlider(ctrl, "Dust Opacity", 55);

            // ---- ルート（ホログラム全体の親）----
            var root = comp.layers.addNull();
            root.name = "HOLO_ROOT";
            root.label = 14;
            root.comment = "HOLO|root";
            root.threeDLayer = true;
            root.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([50, 50, 0]);
            root.property("ADBE Transform Group").property("ADBE Position").setValue([960, 540, 0]);
            root.property("ADBE Transform Group").property("ADBE Rotate Y").expression = EXP.rootOrbit;
            root.property("ADBE Transform Group").property("ADBE Scale").expression = EXP.rootScale;

            // ---- カメラリグ ----
            var camOrbit = comp.layers.addNull();
            camOrbit.name = "HOLO_CAM_ORBIT";
            camOrbit.label = 14;
            camOrbit.comment = "HOLO|camrig";
            camOrbit.threeDLayer = true;
            camOrbit.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([50, 50, 0]);
            camOrbit.property("ADBE Transform Group").property("ADBE Position").setValue([960, 540, 0]);
            camOrbit.property("ADBE Transform Group").property("ADBE Rotate X").setValue(-22);
            camOrbit.property("ADBE Transform Group").property("ADBE Rotate Y").setValue(rng.range(-40, 40));

            var cam = comp.layers.addCamera("HOLO_CAM", [960, 540]);
            cam.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
            cam.parent = camOrbit;
            // ペアレント時にAEが姿勢補正を焼き込むため、明示的にリセットして中心を向かせる
            var camT = cam.property("ADBE Transform Group");
            camT.property("ADBE Position").setValue([50, 50, -1750]); // 親アンカー[50,50]がセンター
            camT.property("ADBE Orientation").setValue([0, 0, 0]);
            camT.property("ADBE Rotate X").setValue(0);
            camT.property("ADBE Rotate Y").setValue(0);
            camT.property("ADBE Rotate Z").setValue(0);

            // ---- リング群 ----
            var ringInfos = [];
            for (var i = 0; i < params.ringCount; i++) {
                var type = HOLO.RING_TYPES[rng.rint(0, 3)];
                ringInfos.push(createRingLayer(comp, root, i, type, params, rng));
            }

            // ---- 品質プリセット ----
            var q = params.quality || "標準";
            var dustDots = (q === "軽量") ? 25 : (q === "高密度" ? 90 : 50);
            var gridCopies = (q === "軽量") ? 15 : (q === "高密度" ? 27 : 21);
            var calloutMax = (q === "軽量") ? 3 : (q === "高密度" ? 7 : 5);

            // ---- グリッド + スティック ----
            if (params.withGrid !== false) {
                createGrid(comp, root, params, rng, gridCopies);
            }

            // ---- コールアウト ----
            var lineLayers = [];
            if (params.withCallouts !== false && ringInfos.length > 0) {
                var cCount = rng.rint(Math.max(2, calloutMax - 2), calloutMax);
                for (var c = 0; c < cCount; c++) {
                    var co = createCallout(comp, root, c, params, rng, ringInfos);
                    lineLayers.push(co.line);
                }
            }

            // ---- ダスト ----
            if (params.withDust !== false) {
                for (var dl = 0; dl < 3; dl++) {
                    createDust(comp, dl, params, rng, dustDots);
                }
            }

            // ---- レイヤー整列 ----
            // 2Dのリーダー線を最上部へ（3Dレイヤー群を分断しないため）
            for (var li = lineLayers.length - 1; li >= 0; li--) {
                lineLayers[li].moveToBeginning();
            }
            // リグ4枚を #1〜#4 に配置
            cam.moveToBeginning();
            camOrbit.moveToBeginning();
            root.moveToBeginning();
            ctrl.moveToBeginning();
            comp.hideShyLayers = true; // 追跡ヌルはシャイで隠す

            comp.openInViewer();
            return comp;
        } catch (e) {
            alert("HoloGen エラー: " + e.toString() + (e.line ? " (line " + e.line + ")" : ""));
            return comp;
        } finally {
            app.endUndoGroup();
        }
    };

    // ---------------------------------------------------------
    // パネルUI
    // ---------------------------------------------------------
    function rgbToHex(rgb) {
        function h(v) {
            var s = Math.round(v * 255).toString(16).toUpperCase();
            return s.length < 2 ? "0" + s : s;
        }
        return h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
    }

    function intToRgb(i) {
        return [((i >> 16) & 255) / 255, ((i >> 8) & 255) / 255, (i & 255) / 255];
    }

    function rgbToInt(rgb) {
        return (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
    }

    function buildUI(hostObj) {
        var pal = (hostObj instanceof Panel)
            ? hostObj
            : new Window("palette", "HoloGen", undefined, { resizeable: true });
        pal.orientation = "row";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 0;
        pal.margins = 0;

        // 縦スクロール: 全UIをcontentに入れ、パネルが低い時はスクロールバーで送る
        var content = pal.add("group");
        content.orientation = "column";
        content.alignChildren = ["fill", "top"];
        content.spacing = 6;
        content.margins = 10;
        content.alignment = ["fill", "top"];

        var scrollBar = pal.add("scrollbar");
        scrollBar.alignment = ["right", "fill"];
        scrollBar.preferredSize.width = 14;
        scrollBar.minvalue = 0;
        scrollBar.visible = false;

        function updateScroll() {
            if (!pal.size || !content.size) return;
            var ph = pal.size.height;
            var ch = content.size.height;
            if (ch > ph + 4) {
                scrollBar.visible = true;
                scrollBar.maxvalue = ch - ph;
                if (scrollBar.value > scrollBar.maxvalue) scrollBar.value = scrollBar.maxvalue;
                content.location = [content.location.x, -Math.round(scrollBar.value)];
            } else {
                scrollBar.visible = false;
                scrollBar.value = 0;
                content.location = [content.location.x, 0];
            }
        }
        scrollBar.onChanging = function () {
            content.location = [content.location.x, -Math.round(scrollBar.value)];
        };

        var state = {
            mainColor: [1, 1, 1],
            accentColor: [1, 1, 1],
            textColor: [1, 1, 1]
        };

        // ---- 生成セクション ----
        var gSeed = content.add("group");
        gSeed.add("statictext", undefined, "シード:");
        var seedField = gSeed.add("edittext", undefined, String(Math.floor(Math.random() * 100000)));
        seedField.characters = 8;
        var diceBtn = gSeed.add("button", undefined, "🎲");
        diceBtn.maximumSize.width = 36;
        diceBtn.onClick = function () {
            seedField.text = String(Math.floor(Math.random() * 100000));
        };

        var randomBtn = content.add("button", undefined, "★ ランダム生成");
        var genBtn = content.add("button", undefined, "この設定で生成");

        // ---- スライダーヘルパー ----
        function sliderRow(parent, label, lo, hi, val, isInt) {
            var g = parent.add("group");
            g.orientation = "row";
            var st = g.add("statictext", undefined, label);
            st.preferredSize.width = 88;
            var sl = g.add("slider", undefined, val, lo, hi);
            sl.preferredSize.width = 120;
            sl.alignment = ["fill", "center"];
            var et = g.add("edittext", undefined, String(val));
            et.characters = 5;
            sl.onChanging = function () {
                et.text = String(isInt ? Math.round(sl.value) : Math.round(sl.value * 10) / 10);
            };
            et.onChange = function () {
                var v = parseFloat(et.text);
                if (!isNaN(v)) sl.value = Math.max(lo, Math.min(hi, v));
            };
            return {
                get: function () { return isInt ? Math.round(sl.value) : sl.value; },
                set: function (v) { sl.value = v; et.text = String(isInt ? Math.round(v) : Math.round(v * 10) / 10); }
            };
        }

        // ---- グローバル設定 ----
        var setPanel = content.add("panel", undefined, "設定");
        setPanel.orientation = "column";
        setPanel.alignChildren = ["fill", "top"];
        setPanel.spacing = 4;
        setPanel.margins = 10;

        var uiRings = sliderRow(setPanel, "リング数", 3, 20, 10, true);
        var uiRadius = sliderRow(setPanel, "基本サイズ", 150, 600, 360, true);
        var uiSpacing = sliderRow(setPanel, "レイヤー間隔", 10, 90, 40, true);
        var uiSpeed = sliderRow(setPanel, "全体速度", 0, 300, 100, true);
        var uiFlicker = sliderRow(setPanel, "フリッカー", 0, 100, 35, true);
        var uiBreathe = sliderRow(setPanel, "呼吸", 0, 100, 15, true);
        var uiOrbit = sliderRow(setPanel, "全体回転", 0, 30, 6, true);

        // ---- 要素ON/OFF + 品質 ----
        var elemPanel = content.add("panel", undefined, "要素");
        elemPanel.orientation = "row";
        elemPanel.alignChildren = ["left", "center"];
        elemPanel.margins = 10;
        var cbCallouts = elemPanel.add("checkbox", undefined, "コールアウト");
        cbCallouts.value = true;
        var cbGrid = elemPanel.add("checkbox", undefined, "グリッド");
        cbGrid.value = true;
        var cbDust = elemPanel.add("checkbox", undefined, "ダスト");
        cbDust.value = true;

        var qGroup = content.add("group");
        qGroup.add("statictext", undefined, "品質:");
        var qDrop = qGroup.add("dropdownlist", undefined, ["軽量", "標準", "高密度"]);
        qDrop.selection = 1;

        // ---- カラー ----
        var colPanel = content.add("panel", undefined, "カラー（クリックで変更）");
        colPanel.orientation = "row";
        colPanel.alignChildren = ["fill", "top"];
        colPanel.margins = 10;

        function colorButton(parent, label, key) {
            var b = parent.add("button", undefined, label + " " + rgbToHex(state[key]));
            b.onClick = function () {
                var picked = $.colorPicker(rgbToInt(state[key]));
                if (picked !== -1) {
                    state[key] = intToRgb(picked);
                    b.text = label + " " + rgbToHex(state[key]);
                }
            };
            return b;
        }
        colorButton(colPanel, "メイン", "mainColor");
        colorButton(colPanel, "アクセント", "accentColor");
        colorButton(colPanel, "テキスト", "textColor");

        // ---- レイヤー詳細 ----
        var detPanel = content.add("panel", undefined, "レイヤー詳細（生成後に個別調整）");
        detPanel.orientation = "column";
        detPanel.alignChildren = ["fill", "top"];
        detPanel.spacing = 4;
        detPanel.margins = 10;

        var refreshBtn = detPanel.add("button", undefined, "リスト更新（開いているHOLOコンポを読む）");
        var ringList = detPanel.add("listbox", undefined, []);
        ringList.preferredSize.height = 110;

        var typeGroup = detPanel.add("group");
        typeGroup.add("statictext", undefined, "種類:");
        var typeDrop = typeGroup.add("dropdownlist", undefined,
            ["ワイヤー", "目盛り", "ドット", "円弧"]);
        typeDrop.selection = 0;

        var uiDetRadius = sliderRow(detPanel, "半径", 20, 700, 300, true);
        var uiDetSpin = sliderRow(detPanel, "回転速度", -40, 40, 5, false);
        var uiDetOpacity = sliderRow(detPanel, "不透明度", 0, 100, 80, true);
        var applyBtn = detPanel.add("button", undefined, "このレイヤーに適用");

        var TYPE_TO_INDEX = { wire: 0, tick: 1, dot: 2, arc: 3 };

        function activeHoloComp() {
            var item = app.project.activeItem;
            if (item && item instanceof CompItem && item.name.indexOf("HOLO_") === 0) return item;
            // アクティブでなければプロジェクト内の最新HOLOコンポを探す
            var found = null;
            for (var i = 1; i <= app.project.numItems; i++) {
                var it = app.project.item(i);
                if (it instanceof CompItem && it.name.indexOf("HOLO_") === 0) found = it;
            }
            return found;
        }

        function refreshRingList() {
            ringList.removeAll();
            var comp = activeHoloComp();
            if (!comp) {
                alert("HOLOコンポが見つかりません。先に生成してください。");
                return;
            }
            for (var i = 1; i <= comp.numLayers; i++) {
                var lyr = comp.layer(i);
                var meta = HOLO.parseRingComment(lyr.comment);
                if (meta.isRing) {
                    var item = ringList.add("item",
                        lyr.name + "  [" + (HOLO.TYPE_LABELS[meta.type] || meta.type) + "]");
                    item.holoLayerName = lyr.name;
                    item.holoCompId = comp.id;
                }
            }
        }

        function findLayerForItem(item) {
            if (!item) return null;
            var comp = null;
            for (var i = 1; i <= app.project.numItems; i++) {
                if (app.project.item(i).id === item.holoCompId) { comp = app.project.item(i); break; }
            }
            if (!comp) return null;
            try { return comp.layer(item.holoLayerName); } catch (e) { return null; }
        }

        refreshBtn.onClick = refreshRingList;

        ringList.onChange = function () {
            var lyr = findLayerForItem(ringList.selection);
            if (!lyr) return;
            var meta = HOLO.parseRingComment(lyr.comment);
            if (meta.type !== null && TYPE_TO_INDEX[meta.type] !== undefined) {
                typeDrop.selection = TYPE_TO_INDEX[meta.type];
            }
            try {
                uiDetRadius.set(lyr.effect("Radius")(1).value);
                uiDetSpin.set(lyr.effect("Spin")(1).value);
                uiDetOpacity.set(lyr.effect("Ring Opacity")(1).value);
                // AE上でも選択して分かりやすく
                var comp = lyr.containingComp;
                for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
                lyr.selected = true;
            } catch (e) { /* エフェクトが消されている場合は無視 */ }
        };

        applyBtn.onClick = function () {
            var lyr = findLayerForItem(ringList.selection);
            if (!lyr) {
                alert("リストからレイヤーを選択してください。\n（レイヤーが見つからない場合は「リスト更新」）");
                return;
            }
            app.beginUndoGroup("HoloGen レイヤー調整");
            try {
                lyr.effect("Radius")(1).setValue(uiDetRadius.get());
                lyr.effect("Spin")(1).setValue(Math.round(uiDetSpin.get() * 10) / 10);
                lyr.effect("Ring Opacity")(1).setValue(uiDetOpacity.get());
                var newType = HOLO.RING_TYPES[typeDrop.selection.index];
                var meta = HOLO.parseRingComment(lyr.comment);
                if (newType !== meta.type) {
                    HOLO.rebuildRingType(lyr, newType);
                    refreshRingList();
                }
            } catch (e) {
                alert("適用エラー: " + e.toString());
            } finally {
                app.endUndoGroup();
            }
        };

        // ---- パラメータ収集 ----
        function paramsFromUI() {
            var seed = parseInt(seedField.text, 10);
            if (isNaN(seed)) { seed = Math.floor(Math.random() * 100000); seedField.text = String(seed); }
            return {
                seed: seed,
                ringCount: uiRings.get(),
                baseRadius: uiRadius.get(),
                spacing: uiSpacing.get(),
                speed: uiSpeed.get(),
                flicker: uiFlicker.get(),
                breathe: uiBreathe.get(),
                orbitSpin: uiOrbit.get(),
                globalScale: 100,
                mainColor: state.mainColor,
                accentColor: state.accentColor,
                textColor: state.textColor,
                withCallouts: cbCallouts.value,
                withGrid: cbGrid.value,
                withDust: cbDust.value,
                quality: qDrop.selection ? qDrop.selection.text : "標準"
            };
        }

        genBtn.onClick = function () {
            HOLO.generate(paramsFromUI());
            refreshRingList();
        };

        randomBtn.onClick = function () {
            var seed = Math.floor(Math.random() * 100000);
            seedField.text = String(seed);
            var keep = {
                mainColor: state.mainColor,
                accentColor: state.accentColor,
                textColor: state.textColor,
                withCallouts: cbCallouts.value,
                withGrid: cbGrid.value,
                withDust: cbDust.value,
                quality: qDrop.selection ? qDrop.selection.text : "標準"
            };
            var p = HOLO.randomParams(seed, keep); // 色・要素ON/OFFは維持、構造だけランダム
            uiRings.set(p.ringCount);
            uiRadius.set(p.baseRadius);
            uiSpacing.set(p.spacing);
            uiFlicker.set(p.flicker);
            uiBreathe.set(p.breathe);
            uiOrbit.set(p.orbitSpin);
            HOLO.generate(p);
            refreshRingList();
        };

        pal.onResizing = pal.onResize = function () {
            this.layout.resize();
            updateScroll();
        };

        if (pal instanceof Window) {
            pal.center();
            pal.show();
        } else {
            pal.layout.layout(true);
        }
        updateScroll();
        return pal;
    }

    // ヘッドレステスト時はUIを出さない
    if ($.global.HOLO_HEADLESS !== true) {
        buildUI(thisObj);
    }

})(this);
