"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = exports.pool = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
dotenv_1.default.config({});
const pg_1 = __importDefault(require("pg"));
const prisma_1 = require("./prisma");
const { Pool } = pg_1.default;
exports.pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});
const corsConfig = {
    origin: (origin, callback) => {
        var _a;
        const origins = ((_a = process.env.ORIGINS) === null || _a === void 0 ? void 0 : _a.split(",")) || [];
        if (!origin || (origin && origins.indexOf(origin) !== -1)) {
            callback(null, true);
        }
        else {
            callback(null, true);
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
};
exports.app = (0, express_1.default)();
exports.app.use((0, cors_1.default)(corsConfig));
exports.app.use(express_1.default.json({ limit: "50mb" }));
exports.app.get("/api/listing/:studentId", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const studentId = (_a = req.params.studentId) === null || _a === void 0 ? void 0 : _a.trim();
        if (!studentId) {
            return res.status(400).json({ error: "StudentId Required" });
        }
        console.log(studentId);
        const type = req.query.type;
        let rcaTypes = ["Practice", "Baseline", "MonthEnd"];
        if (type === "practice") {
            rcaTypes = ["Practice"];
        }
        else if (type === "test") {
            rcaTypes = ["Baseline", "MonthEnd"];
        }
        const { rows } = yield exports.pool.query(`
        SELECT 
            j.assessment_type,
            j.is_shown,
            j.created_at,
            j.month,
            j.week,
            j.passage_title,
            r.assessment_id,
            r.total,
            r.grade
        FROM "RCA_Journey" j
        JOIN "RCA_Result" r ON r.id = j."result_Id"
        WHERE j.student_id = $1
          AND j.assessment_type = ANY($2)
        ORDER BY j.created_at DESC
    `, [studentId, rcaTypes]);
        // only shown
        let reports = rows.filter(r => r.is_shown);
        // best of practice
        if (type === "practice") {
            const best = new Map();
            for (const r of reports) {
                if (r.total === null)
                    continue;
                const ex = best.get(r.assessment_id);
                if (!ex || r.total > ex.total)
                    best.set(r.assessment_id, r);
            }
            reports = [...best.values()];
        }
        // response
        const out = reports.map(r => ({
            type: r.assessment_type,
            assessment_id: r.assessment_id,
            total: r.total,
            grade: r.grade,
            title: r.passage_title,
            submittedAt: r.created_at,
            month: r.month,
            week: r.week,
        }));
        res.json({ reports: out });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "database error" });
    }
}));
function heavyEncrypt(data) {
    const key = crypto_1.default
        .createHash("sha256")
        .update("supersecretkey123456")
        .digest();
    const iv = key.subarray(0, 16);
    let buf = Buffer.from(data);
    for (let i = 0; i < 10000; i++) {
        const cipher = crypto_1.default.createCipheriv("aes-256-ctr", key, iv);
        buf = cipher.update(buf);
    }
    return buf;
}
exports.app.get("/api/encrypt", (req, res) => {
    try {
        const a = "helaosjkjbajblajhkbdasfa";
        const result = heavyEncrypt(a);
        res.send(result.toString("hex"));
    }
    catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});
exports.app.get("/api/prisma/listing/:studentId", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const studentId = (_a = req.params.studentId) === null || _a === void 0 ? void 0 : _a.trim();
        if (!studentId) {
            return res.status(400).json({ error: "StudentId Required" });
        }
        const type = req.query.type;
        let rcaTypes = ["Practice", "Baseline", "MonthEnd"];
        if (type === "practice") {
            rcaTypes = ["Practice"];
        }
        else if (type === "test") {
            rcaTypes = ["Baseline", "MonthEnd"];
        }
        const reports = yield prisma_1.prisma.rCA_Journey.findMany({
            where: {
                student_id: studentId,
                assessment_type: { in: rcaTypes },
                is_shown: true,
            },
            orderBy: { created_at: "desc" },
            include: {
                RCA_Result: {
                    select: {
                        assessment_id: true,
                        total: true,
                        grade: true,
                    },
                },
            },
        });
        let out = reports;
        // best of practice
        if (type === "practice") {
            const best = new Map();
            for (const r of reports) {
                if (((_b = r.RCA_Result) === null || _b === void 0 ? void 0 : _b.total) == null)
                    continue;
                const ex = best.get(r.RCA_Result.assessment_id);
                if (!ex || r.RCA_Result.total > ex.RCA_Result.total)
                    best.set(r.RCA_Result.assessment_id, r);
            }
            out = [...best.values()];
        }
        const resp = out.map((r) => ({
            type: r.assessment_type,
            assessment_id: r.RCA_Result.assessment_id,
            total: r.RCA_Result.total,
            grade: r.RCA_Result.grade,
            title: r.passage_title,
            submittedAt: r.created_at,
            month: r.month,
            week: r.week,
        }));
        res.json({ reports: resp });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "database error" });
    }
}));
exports.app.get("/api/compute/1e7", (req, res) => {
    let cnt = 0;
    for (let i = 0; i < 1e7; i++) {
        cnt++;
    }
    return res.json({ count: cnt });
});
exports.app.get("/api/compute/1e5", (req, res) => {
    let cnt = 0;
    for (let i = 0; i < 1e5; i++) {
        cnt++;
    }
    return res.json({ count: cnt });
});
exports.app.get("/api/bench", (req, res) => {
    res.json({
        ok: true,
        ts: Date.now()
    });
});
const PORT = process.env.PORT || 5001;
exports.app.listen(PORT, () => {
    console.info(`server running on port ${PORT}`);
});
exports.app.use((error, req, res, _next) => {
    console.error(error);
    res.status(500).send(error.message);
});
