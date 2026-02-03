import Foundation

private let hostName = "com.codex.apple_notes_webclipper"
private let cacheDirName = "apple-notes-webclipper"
private let cacheTtlSeconds: TimeInterval = 7 * 24 * 60 * 60

private enum NativeHostError: Error, CustomStringConvertible {
  case invalidMessage(String)
  case io(String)
  case process(String)
  case timeout(String)
  case download(String)

  var description: String {
    switch self {
    case .invalidMessage(let msg): return msg
    case .io(let msg): return msg
    case .process(let msg): return msg
    case .timeout(let msg): return msg
    case .download(let msg): return msg
    }
  }
}

private func readExactly(_ byteCount: Int, from handle: FileHandle) throws -> Data? {
  var data = Data()
  while data.count < byteCount {
    let chunk = try handle.read(upToCount: byteCount - data.count) ?? Data()
    if chunk.isEmpty {
      if data.isEmpty { return nil }
      throw NativeHostError.io("Unexpected EOF")
    }
    data.append(chunk)
  }
  return data
}

private func readNativeMessage() throws -> [String: Any]? {
  guard let header = try readExactly(4, from: .standardInput) else { return nil }
  var lengthLE: UInt32 = 0
  _ = withUnsafeMutableBytes(of: &lengthLE) { header.copyBytes(to: $0) }
  let length = Int(UInt32(littleEndian: lengthLE))
  if length <= 0 { return nil }

  guard let body = try readExactly(length, from: .standardInput) else { return nil }
  let obj = try JSONSerialization.jsonObject(with: body, options: [])
  guard let dict = obj as? [String: Any] else {
    throw NativeHostError.invalidMessage("Message must be a JSON object")
  }
  return dict
}

private func writeNativeMessage(_ payload: [String: Any]) throws {
  let data = try JSONSerialization.data(withJSONObject: payload, options: [])
  var lengthLE = UInt32(data.count).littleEndian
  let header = Data(bytes: &lengthLE, count: 4)
  try FileHandle.standardOutput.write(contentsOf: header)
  try FileHandle.standardOutput.write(contentsOf: data)
}

private struct ProcessResult {
  let stdout: String
  let stderr: String
  let exitCode: Int32
}

private func runProcess(_ executable: String, _ args: [String], stdin: Data? = nil) throws -> ProcessResult {
  let proc = Process()
  proc.executableURL = URL(fileURLWithPath: executable)
  proc.arguments = args

  let outPipe = Pipe()
  let errPipe = Pipe()
  proc.standardOutput = outPipe
  proc.standardError = errPipe

  if let stdin {
    let inPipe = Pipe()
    proc.standardInput = inPipe
    try proc.run()
    inPipe.fileHandleForWriting.write(stdin)
    try inPipe.fileHandleForWriting.close()
  } else {
    try proc.run()
  }

  proc.waitUntilExit()

  let stdoutData = outPipe.fileHandleForReading.readDataToEndOfFile()
  let stderrData = errPipe.fileHandleForReading.readDataToEndOfFile()
  let stdout = String(data: stdoutData, encoding: .utf8) ?? ""
  let stderr = String(data: stderrData, encoding: .utf8) ?? ""

  return ProcessResult(stdout: stdout.trimmingCharacters(in: .whitespacesAndNewlines),
                       stderr: stderr.trimmingCharacters(in: .whitespacesAndNewlines),
                       exitCode: proc.terminationStatus)
}

private func runJXA(_ code: String) throws -> String {
  let res = try runProcess("/usr/bin/osascript", ["-l", "JavaScript", "-"], stdin: code.data(using: .utf8))
  if res.exitCode != 0 {
    throw NativeHostError.process(res.stderr.isEmpty ? "JXA failed (code \(res.exitCode))" : res.stderr)
  }
  return res.stdout
}

private func runAppleScriptFile(_ scriptPath: String, argv: [String]) throws -> String {
  let res = try runProcess("/usr/bin/osascript", [scriptPath] + argv)
  if res.exitCode != 0 {
    throw NativeHostError.process(res.stderr.isEmpty ? "osascript failed (code \(res.exitCode))" : res.stderr)
  }
  return res.stdout
}

private func escapeHtml(_ text: String) -> String {
  var out = text
  out = out.replacingOccurrences(of: "&", with: "&amp;")
  out = out.replacingOccurrences(of: "<", with: "&lt;")
  out = out.replacingOccurrences(of: ">", with: "&gt;")
  out = out.replacingOccurrences(of: "\"", with: "&quot;")
  out = out.replacingOccurrences(of: "'", with: "&#39;")
  return out
}

private func markdownToNotesHtml(_ markdown: String) -> String {
  let lines = markdown.components(separatedBy: .newlines)
  var out: [String] = []
  for line in lines {
    if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      out.append("<div><br></div>")
      continue
    }

    let trimmed = line.trimmingCharacters(in: .whitespaces)
    if trimmed.hasPrefix("<img ") && trimmed.hasSuffix(">") {
      out.append("<div>\(trimmed)</div>")
      continue
    }

    var prefixHtml = ""
    var rest = line
    if let range = line.range(of: #"^[ \t]+"#, options: .regularExpression) {
      let ws = String(line[range])
      rest = String(line[range.upperBound...])
      let expanded = ws.replacingOccurrences(of: "\t", with: "    ")
      prefixHtml = expanded.map { $0 == " " ? "&nbsp;" : String($0) }.joined()
    }
    out.append("<div>\(prefixHtml)\(escapeHtml(rest))</div>")
  }
  return out.joined(separator: "\n")
}

private func guessMime(from url: URL) -> String {
  switch url.pathExtension.lowercased() {
  case "png": return "image/png"
  case "jpg", "jpeg": return "image/jpeg"
  case "gif": return "image/gif"
  case "webp": return "image/webp"
  default: return "application/octet-stream"
  }
}

private func fileExtension(for mime: String, fallbackUrl: URL?) -> String {
  let m = mime.lowercased()
  switch m {
  case "image/png": return ".png"
  case "image/jpeg", "image/jpg": return ".jpg"
  case "image/gif": return ".gif"
  case "image/webp": return ".webp"
  default:
    if let ext = fallbackUrl?.pathExtension, !ext.isEmpty, ext.count <= 6 {
      return "." + ext
    }
    return ".bin"
  }
}

private func ensureCacheDir() throws -> URL {
  let dir = FileManager.default.temporaryDirectory.appendingPathComponent(cacheDirName, isDirectory: true)
  try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  return dir
}

private func cleanupCacheDirIfPossible() {
  do {
    let dir = try ensureCacheDir()
    let now = Date()
    let contents = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey], options: [.skipsHiddenFiles])
    for file in contents {
      let values = try file.resourceValues(forKeys: [.contentModificationDateKey])
      if let mtime = values.contentModificationDate, now.timeIntervalSince(mtime) > cacheTtlSeconds {
        try? FileManager.default.removeItem(at: file)
      }
    }
  } catch {
    // Ignore cache cleanup errors.
  }
}

private func downloadBytes(urlString: String, referer: String?) throws -> (data: Data, mime: String) {
  guard let url = URL(string: urlString) else { throw NativeHostError.download("Invalid URL: \(urlString)") }

  if url.isFileURL {
    let data = try Data(contentsOf: url)
    return (data, guessMime(from: url))
  }

  var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
  req.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari", forHTTPHeaderField: "User-Agent")
  if let referer, !referer.isEmpty { req.setValue(referer, forHTTPHeaderField: "Referer") }

  let sem = DispatchSemaphore(value: 0)
  var resultData: Data?
  var resultMime: String?
  var resultErr: Error?

  URLSession.shared.dataTask(with: req) { data, response, error in
    defer { sem.signal() }
    if let error { resultErr = error; return }
    resultData = data
    if let http = response as? HTTPURLResponse {
      let ct = http.value(forHTTPHeaderField: "Content-Type") ?? ""
      let mime = ct.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: true).first.map { String($0).trimmingCharacters(in: .whitespaces) }
      if let mime, !mime.isEmpty { resultMime = mime }
    }
  }.resume()

  if sem.wait(timeout: .now() + 60) == .timedOut {
    throw NativeHostError.timeout("Timeout downloading image: \(urlString)")
  }
  if let resultErr { throw NativeHostError.download(resultErr.localizedDescription) }
  guard let data = resultData else { throw NativeHostError.download("No data downloading image: \(urlString)") }
  let mime = resultMime ?? guessMime(from: url)
  return (data, mime)
}

private func cacheImageToFileUrl(urlString: String, referer: String?) throws -> URL {
  let (data, mime) = try downloadBytes(urlString: urlString, referer: referer)
  let dir = try ensureCacheDir()
  let ext = fileExtension(for: mime, fallbackUrl: URL(string: urlString))
  let filename = "img-\(UUID().uuidString)\(ext)"
  let path = dir.appendingPathComponent(filename)
  try data.write(to: path, options: .atomic)
  return path
}

private func replaceImageTokens(markdown: String, images: [[String: Any]], sourceUrl: String?) -> String {
  var out = markdown
  for img in images {
    guard let token = img["token"] as? String, let url = img["url"] as? String else { continue }
    let placeholder = "[[[IMG:\(token)]]]"
    do {
      let fileUrl = try cacheImageToFileUrl(urlString: url, referer: sourceUrl)
      out = out.replacingOccurrences(of: placeholder, with: "<img src=\"\(fileUrl.absoluteString)\">")
    } catch {
      out = out.replacingOccurrences(of: placeholder, with: url)
    }
  }
  return out
}

private func listFolders() throws -> [String: Any] {
  let code = #"""
    const Notes = Application('Notes');
    Notes.includeStandardAdditions = true;

    function collect(folder, prefix) {
      const name = folder.name();
      const path = prefix ? `${prefix}/${name}` : name;
      let out = [{ path }];
      const children = folder.folders();
      for (const child of children) out = out.concat(collect(child, path));
      return out;
    }

    const accounts = Notes.accounts().map(acc => {
      const folders = [];
      for (const f of acc.folders()) folders.push(...collect(f, ''));
      const filtered = folders.filter(x => x.path !== 'Recently Deleted');
      return { name: acc.name(), folders: filtered };
    });

    JSON.stringify({ ok: true, accounts });
  """#

  let raw = try runJXA(code)
  let obj = try JSONSerialization.jsonObject(with: Data(raw.utf8), options: [])
  guard let dict = obj as? [String: Any] else { throw NativeHostError.process("Invalid listFolders output") }
  return dict
}

private func createNote(msg: [String: Any]) throws -> [String: Any] {
  let title = (msg["title"] as? String) ?? "Untitled"
  let sourceUrl = (msg["sourceUrl"] as? String) ?? ""
  var markdown = (msg["markdown"] as? String) ?? ""
  markdown = markdown.trimmingCharacters(in: .whitespacesAndNewlines)

  let folder = (msg["folder"] as? [String: Any]) ?? [:]
  let accountName = (folder["accountName"] as? String) ?? ""
  let folderPath = (folder["folderPath"] as? String) ?? ""

  let images = (msg["images"] as? [[String: Any]]) ?? []
  if !images.isEmpty {
    markdown = replaceImageTokens(markdown: markdown, images: images, sourceUrl: sourceUrl)
  }

  let html = markdownToNotesHtml(markdown)
  let tmpDir = FileManager.default.temporaryDirectory
  let tmpUrl = tmpDir.appendingPathComponent("apple-notes-webclipper-\(UUID().uuidString).html")
  guard let htmlData = html.data(using: .utf8) else {
    throw NativeHostError.io("Failed to encode HTML as UTF-8")
  }
  try htmlData.write(to: tmpUrl, options: .atomic)

  defer { try? FileManager.default.removeItem(at: tmpUrl) }

  let exeUrl = URL(fileURLWithPath: CommandLine.arguments.first ?? ".")
  let scriptsDir = exeUrl.deletingLastPathComponent().appendingPathComponent("scripts")
  let scriptPath = scriptsDir.appendingPathComponent("create_note.applescript").path

  let noteId = try runAppleScriptFile(scriptPath, argv: [accountName, folderPath, title, tmpUrl.path])
  return ["ok": true, "noteId": noteId]
}

private func renderHtmlPreview(msg: [String: Any]) throws -> [String: Any] {
  let title = (msg["title"] as? String) ?? "Untitled"
  let sourceUrl = (msg["sourceUrl"] as? String) ?? ""
  var markdown = (msg["markdown"] as? String) ?? ""
  markdown = markdown.trimmingCharacters(in: .whitespacesAndNewlines)

  let images = (msg["images"] as? [[String: Any]]) ?? []
  if !images.isEmpty {
    markdown = replaceImageTokens(markdown: markdown, images: images, sourceUrl: sourceUrl)
  }

  let fragment = markdownToNotesHtml(markdown)
  let full = """
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>\(escapeHtml(title))</title>
  </head>
  <body>
  \(fragment)
  </body>
  </html>
  """

  let dir = try ensureCacheDir()
  let outUrl = dir.appendingPathComponent("preview-\(UUID().uuidString).html")
  guard let data = full.data(using: .utf8) else { throw NativeHostError.io("Failed to encode HTML as UTF-8") }
  try data.write(to: outUrl, options: .atomic)

  return ["ok": true, "htmlPath": outUrl.path, "htmlFileUrl": outUrl.absoluteString]
}

cleanupCacheDirIfPossible()

while true {
  do {
    guard let msg = try readNativeMessage() else { break }
    let action = (msg["action"] as? String) ?? ""

    switch action {
    case "ping":
      try writeNativeMessage(["ok": true])
    case "listFolders":
      try writeNativeMessage(try listFolders())
    case "createNote":
      try writeNativeMessage(try createNote(msg: msg))
    case "renderHtml":
      try writeNativeMessage(try renderHtmlPreview(msg: msg))
    default:
      try writeNativeMessage(["ok": false, "error": "Unknown action: \(action)"])
    }
  } catch {
    let errMsg = (error as? NativeHostError)?.description ?? String(describing: error)
    try? writeNativeMessage(["ok": false, "error": errMsg])
  }
}
