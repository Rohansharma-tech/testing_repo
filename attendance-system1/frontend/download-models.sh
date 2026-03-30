#!/bin/bash
# ============================================================
# download-models.sh
# Downloads face-api.js model weights into the frontend/public/models/ folder
# Run this ONCE before starting the frontend: bash download-models.sh
# ============================================================

MODELS_DIR="./public/models"
BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

mkdir -p "$MODELS_DIR"
echo "📥 Downloading face-api.js model weights to $MODELS_DIR ..."

files=(
  "ssd_mobilenetv1_model-weights_manifest.json"
  "ssd_mobilenetv1_model-shard1"
  "ssd_mobilenetv1_model-shard2"
  "face_landmark_68_model-weights_manifest.json"
  "face_landmark_68_model-shard1"
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
  "face_recognition_model-shard2"
)

for file in "${files[@]}"; do
  echo "  ⬇️  $file"
  curl -sL "$BASE_URL/$file" -o "$MODELS_DIR/$file"
done

echo ""
echo "✅ All models downloaded to $MODELS_DIR"
echo "   You can now run 'npm run dev' in the frontend folder."
