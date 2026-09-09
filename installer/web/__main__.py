import uvicorn

if __name__ == "__main__":
    uvicorn.run("installer.web.app:app", host="0.0.0.0", port=7000)
