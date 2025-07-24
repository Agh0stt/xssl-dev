#!/bin/bash

NAME=$1
BASE_URL="https://xssl-pkg-repo.vercel.app/stable/pkg/release/"
DEST_DIR=".pkg"

mkdir -p "$DEST_DIR"
wget  -O -q "$DEST_DIR/$NAME.pkg" "$BASE_URL/$NAME.pkg"

if [ $? -eq 0 ]; then
  echo " Package '$NAME' downloaded to $DEST_DIR/"
else
  echo " Failed to download package '$NAME'"
fi
