/* All engine, worker and language URLs are served by this local application. */
(function (root) {
  let enginePromise;
  function engine() {
    return (enginePromise ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "vendor-receipts/tesseract.js/dist/tesseract.min.js";
      s.onload = resolve;
      s.onerror = () => {
        enginePromise = null;
        reject(Error("Não foi possível abrir o motor local de leitura."));
      };
      document.head.append(s);
    }));
  }
  async function read(file, progress, signal, options = {}) {
    if (!file || file.size > 10 * 1024 * 1024)
      throw Error("Escolhe uma imagem até 10 MB ou um PDF até 8 MB.");
    const isPDF = file.type === "application/pdf";
    if (
      !isPDF &&
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      throw Error("Escolhe PNG, JPEG, WebP ou PDF.");
    if (isPDF && file.size > 8 * 1024 * 1024)
      throw Error(
        "O PDF deve ter até 8 MB para ficar guardado como comprovativo.",
      );
    let worker, pdf, task;
    const abort = () => {
      worker?.terminate();
      task?.destroy();
    };
    signal?.addEventListener("abort", abort, { once: true });
    const check = () => {
      if (signal?.aborted) throw Error("Leitura cancelada.");
    };
    async function ocr(canvas) {
      check();
      await engine();
      check();
      worker ||= await Tesseract.createWorker("por", 1, {
        workerPath: new URL(
          "vendor-receipts/tesseract.js/dist/worker.min.js",
          location.href,
        ).href,
        corePath: new URL("vendor-receipts/tesseract.js-core/", location.href)
          .href,
        langPath: new URL("vendor-receipts/", location.href).href,
        gzip: false,
        cacheMethod: 'none',
        // Initialisation errors reject createWorker (local vendor fix); the
        // caller displays them instead of throwing a second global exception.
        errorHandler: () => {},
        logger: (m) =>
          progress(
            "A ler o documento… " + Math.round((m.progress || 0) * 100) + "%",
          ),
      });
      check();
      return (await worker.recognize(canvas)).data.text;
    }
    try {
      let text = "",
        attachment;
      if (isPDF) {
        const lib = await import("./vendor-receipts/pdfjs-dist/build/pdf.mjs");
        check();
        lib.GlobalWorkerOptions.workerSrc = new URL(
          "vendor-receipts/pdfjs-dist/build/pdf.worker.mjs",
          location.href,
        ).href;
        task = lib.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
          isEvalSupported: false,
        });
        pdf = await task.promise;
        check();
        if (pdf.numPages > 10)
          throw Error("Nesta versão, usa faturas com até 10 páginas.");
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p),
            content = await page.getTextContent();
          check();
          let lastY = null,
            line = "";
          for (const item of content.items) {
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 3) {
              line += "\n";
            }
            line += item.str + " ";
            lastY = item.transform[5];
            if (item.hasEOL) {
              line += "\n";
              lastY = null;
            }
          }
          if (line.trim().length < 25) {
            const view = page.getViewport({ scale: 2 });
            if (view.width * view.height > 16000000)
              throw Error("A página é demasiado grande.");
            const canvas = document.createElement("canvas");
            canvas.width = view.width;
            canvas.height = view.height;
            await page.render({
              canvasContext: canvas.getContext("2d"),
              viewport: view,
            }).promise;
            line = await ocr(canvas);
          }
          text += line + "\n";
        }
        if (options.attachment !== false)
          attachment = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () =>
              resolve({ name: file.name, type: file.type, size: file.size, data: r.result });
            r.onerror = () => reject(Error("Falha ao guardar o comprovativo."));
            r.readAsDataURL(file);
          });
      } else {
        const bitmap = await createImageBitmap(file);
        check();
        try {
          if (bitmap.width * bitmap.height > 40000000)
            throw Error("A imagem é demasiado grande.");
          const scale = Math.min(
              1,
              2200 / Math.max(bitmap.width, bitmap.height),
            ),
            canvas = document.createElement("canvas");
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          text = await ocr(canvas);
          if (options.attachment !== false) {
            let quality = 0.85,
              url;
            do {
              url = canvas.toDataURL("image/jpeg", quality);
              quality -= 0.1;
            } while (url.length > 1300000 && quality > 0.25);
            if (url.length > 1300000)
              throw Error(
                "A imagem continua demasiado grande. Recorta a fatura e tenta novamente.",
              );
            attachment = {
              name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
              type: "image/jpeg",
              size: Math.round((url.length - url.indexOf(",") - 1) * 3 / 4),
              data: url,
            };
          }
        } finally {
          bitmap.close();
        }
      }
      check();
      return { text, attachment };
    } catch (error) {
      // Some engine failures reject with a string; the UI needs an Error.
      if (signal?.aborted) throw Error('Leitura cancelada.');
      if (error instanceof Error) throw error;
      throw Error('Falha no motor local de leitura: ' + String(error));
    } finally {
      signal?.removeEventListener("abort", abort);
      await worker?.terminate();
      await task?.destroy();
    }
  }
  root.ReceiptReader = { read };
})(globalThis);
