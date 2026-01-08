import cors, { CorsOptions } from "cors";
import express, { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config({});

import pkg from "pg"
import { prisma } from "./prisma";
const { Pool } = pkg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const corsConfig: CorsOptions = {
  origin: (origin, callback) => {
    const origins = process.env.ORIGINS?.split(",") || [];
    if (!origin || (origin && origins.indexOf(origin) !== -1)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

export const app = express();
app.use(cors(corsConfig));
app.use(express.json({ limit: "50mb" }));

app.get("/api/listing/:studentId", async (req,res)=>{
      try {
    const studentId = req.params.studentId?.trim()
    if (!studentId) {
      return res.status(400).json({ error: "StudentId Required" })
    }
    console.log(studentId);
    const type = req.query.type

    let rcaTypes = ["Practice", "Baseline", "MonthEnd"]

    if (type === "practice") {
      rcaTypes = ["Practice"]
    } else if (type === "test") {
      rcaTypes = ["Baseline", "MonthEnd"]
    }

    const { rows } = await pool.query(`
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
    `, [studentId, rcaTypes])


    // only shown
    let reports = rows.filter(r => r.is_shown)

    // best of practice
    if (type === "practice") {
      const best = new Map()
      for (const r of reports) {
        if (r.total === null) continue
        const ex = best.get(r.assessment_id)
        if (!ex || r.total > ex.total) best.set(r.assessment_id, r)
      }
      reports = [...best.values()]
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
    }))

    res.json({ reports: out })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "database error" })
  }

})


function heavyEncrypt(data:any) {
  const key = crypto
    .createHash("sha256")
    .update("supersecretkey123456")
    .digest();
 
  const iv = key.subarray(0, 16);
 
  let buf = Buffer.from(data);
 
  for (let i = 0; i < 10000; i++) {
    const cipher = crypto.createCipheriv("aes-256-ctr", key, iv);
    buf = cipher.update(buf);
  }
 
  return buf;
}

app.get("/api/encrypt", (req, res) => {
    try {
            const a = "helaosjkjbajblajhkbdasfa";
    const result = heavyEncrypt(a);
  res.send(result.toString("hex"));
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }

});


app.get("/api/prisma/listing/:studentId", async (req, res) => {
  try {
    const studentId = req.params.studentId?.trim()
    if (!studentId) {
      return res.status(400).json({ error: "StudentId Required" })
    }

    const type = req.query.type as string | undefined

    let rcaTypes = ["Practice", "Baseline", "MonthEnd"]

    if (type === "practice") {
      rcaTypes = ["Practice"]
    } else if (type === "test") {
      rcaTypes = ["Baseline", "MonthEnd"]
    }

    const reports = await prisma.rCA_Journey.findMany({
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
    })

    let out = reports

    // best of practice
    if (type === "practice") {
      const best = new Map<string, typeof reports[number]>()
      for (const r of reports) {
        if (r.RCA_Result?.total == null) continue
        const ex = best.get(r.RCA_Result.assessment_id)
        if (!ex || r.RCA_Result.total > ex.RCA_Result.total!) best.set(r.RCA_Result.assessment_id, r)
      }
      out = [...best.values()]
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
    }))

    res.json({ reports: resp })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "database error" })
  }
})

app.get("/api/compute/1e7",(req,res)=>{
    let cnt =0;
    for(let i=0;i<1e7;i++){
        cnt++;
    }
    return res.json({count:cnt})
})

app.get("/api/compute/1e5",(req,res)=>{
    let cnt =0;
    for(let i=0;i<1e5;i++){
        cnt++;
    }
    return res.json({count:cnt})
})

app.get("/api/bench", (req, res) => {
  res.json({
    ok: true,
    ts: Date.now()
  })
})
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.info(`server running on port ${PORT}`);
});



app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(error)

  res.status(500).send(error.message);
});
