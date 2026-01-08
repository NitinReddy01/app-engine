package routes

import (
	"encoding/json"
	"go-app-engine/internal/config"
	"go-app-engine/internal/db"
	"go-app-engine/internal/middlewares"
	"log"
	"strings"
	"time"

	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/hex"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type ProductStatus struct {
	UnderMaintenance bool   `datastore:"under_maintenance"`
	CurrentVersion   string `datastore:"current_version"`
	UpdateRequired   bool   `datastore:"update_required"`
}

func New(cfg *config.Config) *chi.Mux {
	r := chi.NewRouter()

	r.Route("/api", func(r chi.Router) {

		r.Use(func(next http.Handler) http.Handler {
			return middlewares.CORSMiddleware(next, cfg.AllowedOrigins)
		})

		r.Group(func(public chi.Router) {
			public.Get("/health/sql/{productId}", func(w http.ResponseWriter, r *http.Request) {

				productId := strings.TrimSpace(r.PathValue("productId"))
				if productId == "" {
					JSON(w, http.StatusBadRequest, "Invalid Product Id")
					return
				}

				ctx := r.Context()

				query := `
							SELECT under_maintenance, current_version, update_required
							FROM "ProductStatus"
							WHERE product = $1
						`

				var underMaintenance, updateRequired bool
				var currentVersion string

				err := db.Pool.QueryRow(ctx, query, productId).
					Scan(&underMaintenance, &currentVersion, &updateRequired)

				if err != nil {
					log.Printf("DB error: %v", err)
					JSON(w, http.StatusInternalServerError, map[string]string{
						"error": "database error",
					})
					return
				}

				JSON(w, http.StatusOK, map[string]any{
					"under_maintenance": underMaintenance,
					"current_version":   currentVersion,
					"update_required":   updateRequired,
				})
			})

			public.Get("/listing/{studentId}", GetStudentRCAReports)

			public.Get("/bench", func(w http.ResponseWriter, r *http.Request) {
				JSON(w, http.StatusOK, map[string]any{
					"ok": true,
					"ts": time.Now().UnixNano(),
				})
			})

			public.Get("/compute/1e5", func(w http.ResponseWriter, r *http.Request) {
				var cnt int64 = 0
				for i := int64(0); i < 1_000_00; i++ {
					cnt++
				}
				JSON(w, http.StatusOK, map[string]any{
					"count": cnt,
				})
			})

			public.Get("/compute/1e7", func(w http.ResponseWriter, r *http.Request) {
				var cnt int64 = 0
				for i := int64(0); i < 100_000_00; i++ {
					cnt++
				}
				JSON(w, http.StatusOK, map[string]any{
					"count": cnt,
				})
			})

			public.Get("/encrypt", Encrypthandler)

		})
	})

	return r
}

func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if data == nil {
		return
	}
	err := json.NewEncoder(w).Encode(data)
	if err != nil {
		msg := map[string]string{"message": "Internal Server Error"}
		json.NewEncoder(w).Encode(msg)
	}
}

func GetStudentRCAReports(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	studentID := chi.URLParam(r, "studentId")
	if studentID == "" {
		http.Error(w, "StudentId Required", 400)
		return
	}

	reportType := r.URL.Query().Get("type")
	// 1️⃣ Build RCA type filter
	rcaTypes := []string{"Practice", "Baseline", "MonthEnd"}

	if reportType == "practice" {
		rcaTypes = []string{"Practice"}
	} else if reportType == "test" {
		rcaTypes = []string{"Baseline", "MonthEnd"}
	}

	// 2️⃣ Query DB
	rows, err := db.Pool.Query(ctx, `
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
    `, studentID, rcaTypes)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	// 3️⃣ Load into memory
	type Row struct {
		Type         string
		IsShown      bool
		CreatedAt    time.Time
		Month        int
		Week         int
		Title        string
		AssessmentID string
		Total        *float64
		Grade        string
	}

	var reports []Row

	for rows.Next() {
		var r Row
		if err := rows.Scan(
			&r.Type,
			&r.IsShown,
			&r.CreatedAt,
			&r.Month,
			&r.Week,
			&r.Title,
			&r.AssessmentID,
			&r.Total,
			&r.Grade,
		); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		if r.IsShown {
			reports = append(reports, r)
		}
	}

	// 4️⃣ Best of practice
	if reportType == "practice" {
		best := make(map[string]Row)
		for _, r := range reports {
			if r.Total == nil {
				continue
			}
			existing, ok := best[r.AssessmentID]
			if !ok || *r.Total > *existing.Total {
				best[r.AssessmentID] = r
			}
		}
		reports = reports[:0]
		for _, v := range best {
			reports = append(reports, v)
		}
	}

	// 5️⃣ Map to response
	type Resp struct {
		Type         string    `json:"type"`
		AssessmentID string    `json:"assessment_id"`
		Total        *float64  `json:"total"`
		Grade        string    `json:"grade"`
		Title        string    `json:"title"`
		SubmittedAt  time.Time `json:"submittedAt"`
		Month        int       `json:"month"`
		Week         int       `json:"week"`
	}

	out := make([]Resp, 0, len(reports))
	for _, r := range reports {
		out = append(out, Resp{
			Type:         r.Type,
			AssessmentID: r.AssessmentID,
			Total:        r.Total,
			Grade:        r.Grade,
			Title:        r.Title,
			SubmittedAt:  r.CreatedAt,
			Month:        r.Month,
			Week:         r.Week,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"reports": out})
}

func heavyEncrypt(data []byte) []byte {
	key := sha256.Sum256([]byte("supersecretkey123456"))
	iv := key[:aes.BlockSize]

	buf := make([]byte, len(data))
	copy(buf, data)

	for i := 0; i < 10000; i++ {
		block, _ := aes.NewCipher(key[:])
		stream := cipher.NewCTR(block, iv)
		stream.XORKeyStream(buf, buf)
	}

	return buf
}

func Encrypthandler(w http.ResponseWriter, r *http.Request) {
	a := "helaosjkjbajblajhkbdasfa"
	result := heavyEncrypt([]byte(a))
	w.Write([]byte(hex.EncodeToString(result)))
}
