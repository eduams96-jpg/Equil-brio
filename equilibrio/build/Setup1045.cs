using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;

internal static class Setup1045
{
    private const string From = "1.0.44";
    private const string To = "1.0.45";
    private const string BackupName = "app.equilibrio-1.0.44-backup";
    private static readonly string DefaultInstalled = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Equilibrio");

    private static string ResolveInstallRoot(string explicitPath = null)
    {
        if (!string.IsNullOrWhiteSpace(explicitPath))
            return Path.GetFullPath(explicitPath);

        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            foreach (var rootKey in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
            {
                try
                {
                    using (var baseKey = RegistryKey.OpenBaseKey(rootKey, view))
                    using (var uninstall = baseKey.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"))
                    {
                        if (uninstall == null) continue;
                        foreach (var subName in uninstall.GetSubKeyNames())
                        {
                            using (var sub = uninstall.OpenSubKey(subName))
                            {
                                if (sub == null) continue;
                                var displayName = sub.GetValue("DisplayName") as string ?? "";
                                if (!displayName.Equals("Equilíbrio", StringComparison.OrdinalIgnoreCase) &&
                                    !displayName.Equals("Equilibrio", StringComparison.OrdinalIgnoreCase) &&
                                    subName.IndexOf("financaspessoais", StringComparison.OrdinalIgnoreCase) < 0)
                                    continue;
                                var location = sub.GetValue("InstallLocation") as string;
                                if (!string.IsNullOrWhiteSpace(location))
                                {
                                    var candidate = Path.GetFullPath(location.Trim().Trim('"'));
                                    if (File.Exists(Path.Combine(candidate, "Equilibrio.exe")))
                                        return candidate;
                                }
                            }
                        }
                    }
                }
                catch { }
            }
        }
        return DefaultInstalled;
    }

    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        try
        {
            if (args.Length == 2 && args[0] == "--ensaio")
            {
                var fixture = Path.GetFullPath(args[1]);
                var installed = ResolveInstallRoot();
                if (!File.Exists(Path.Combine(fixture, ".equilibrio-setup-fixture")) ||
                    fixture.StartsWith(installed + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(fixture, installed, StringComparison.OrdinalIgnoreCase) ||
                    fixture.StartsWith(DefaultInstalled + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(fixture, DefaultInstalled, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Pasta de ensaio inválida.");
                Install(fixture, true);
                return 0;
            }
            string customDir = null;
            if (args.Length == 2 && args[0] == "--pasta")
            {
                customDir = args[1];
                args = new string[0];
            }
            else if (args.Length == 3 && args[0] == "--instalar" && args[1] == "--pasta")
            {
                customDir = args[2];
                args = new[] { "--instalar" };
            }

            if (args.Length == 0)
            {
                Console.WriteLine("Equilíbrio v" + To + " — atualização da aplicação Windows");
                Console.WriteLine("Fecha o Equilíbrio. A versão anterior será guardada para reversão.");
                Console.WriteLine("Carrega em Enter para iniciar a atualização ou fecha esta janela.");
                if (Console.ReadLine() == null) return 1;
                var forwardArgs = customDir != null ? "--instalar --pasta \"" + customDir.TrimEnd('\\') + "\"" : "--instalar";
                var process = Process.Start(new ProcessStartInfo {
                    FileName = Assembly.GetExecutingAssembly().Location,
                    Arguments = forwardArgs, UseShellExecute = true, Verb = "runas"
                });
                if (process == null) throw new InvalidOperationException("Não foi possível iniciar a instalação.");
                using (process) { process.WaitForExit(); return process.ExitCode; }
            }
            if (args.Length != 1 || args[0] != "--instalar")
                throw new ArgumentException("Opção inválida.");
            try
            {
                var installRoot = ResolveInstallRoot(customDir);
                using (var mutex = new Mutex(false, @"Global\Equilibrio-Setup-v1.0.45"))
                {
                    bool acquired;
                    try { acquired = mutex.WaitOne(0); }
                    catch (AbandonedMutexException) { acquired = true; }
                    if (!acquired) throw new InvalidOperationException("Já existe uma instalação em curso.");
                    try { Install(installRoot, false); }
                    finally { mutex.ReleaseMutex(); }
                }
                return 0;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error.Message);
                return 1;
            }
            finally
            {
                Console.WriteLine("Carrega em Enter para fechar.");
                Console.ReadLine();
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            if (args.Length == 0 && !Console.IsInputRedirected) Console.ReadLine();
            return 1;
        }
    }

    private static void Install(string root, bool fixture)
    {
        string resources = Path.Combine(root, "resources");
        string app = Path.Combine(resources, "app");
        string rollback = Path.Combine(resources, BackupName);
        string stage = Path.Combine(resources, "app.equilibrio-stage-" + Guid.NewGuid().ToString("N"));
        string replaced = Path.Combine(resources, "app.equilibrio-replaced-" + Guid.NewGuid().ToString("N"));
        if (!File.Exists(Path.Combine(root, "Equilibrio.exe")) || !Directory.Exists(resources))
            throw new InvalidOperationException("Instalação do Equilíbrio em falta. Pasta esperada: " + root);
        Regular(root);
        Regular(resources);
        if (!fixture) RequireClosed(root);
        if (!Directory.Exists(app) && Directory.Exists(rollback))
        {
            Regular(rollback);
            if (Version(rollback) != From) throw new InvalidOperationException("A cópia de reversão tem uma versão inesperada.");
            Directory.Move(rollback, app);
        }
        Regular(app);
        using (var bytes = Assembly.GetExecutingAssembly().GetManifestResourceStream("equilibrio-maintenance"))
        using (var zip = new ZipArchive(bytes, ZipArchiveMode.Read))
        {
            var files = ReadManifest(zip);
            string currentVersion = Version(app);
            if (currentVersion == To && TryVerify(app, files))
            {
                Console.WriteLine("A v" + To + " já está instalada e verificada.");
                return;
            }
            bool hasRollbackBaseline = Directory.Exists(rollback) && Version(rollback) == From;
            string baselineSource = currentVersion == From ? app : (currentVersion == To && hasRollbackBaseline ? rollback : null);
            if (baselineSource == null)
                throw new InvalidOperationException("Este instalador exige a v" + From + " (ou uma instalação v" + To + " com cópia de reversão v" + From + ").");
            if (currentVersion == From && Directory.Exists(rollback) && !hasRollbackBaseline)
                throw new InvalidOperationException("A pasta de reversão já existe com uma versão inesperada: " + rollback);
            try
            {
                CopyTree(baselineSource, stage);
                foreach (var entry in zip.Entries.Where(item => item.FullName.StartsWith("app/", StringComparison.Ordinal)))
                {
                    string relative = entry.FullName.Substring(4);
                    if (!files.ContainsKey(relative)) throw new InvalidDataException("Recurso fora do manifesto.");
                    string file = Target(stage, relative);
                    Directory.CreateDirectory(Path.GetDirectoryName(file));
                    using (var input = entry.Open())
                    using (var output = new FileStream(file, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        input.CopyTo(output);
                        output.Flush(true);
                    }
                }
                Verify(stage, files);
                if (Version(stage) != To) throw new InvalidDataException("Versão inesperada na preparação.");
                if (!fixture) RequireClosed(root);
                string swapTarget = hasRollbackBaseline ? replaced : rollback;
                Directory.Move(app, swapTarget);
                try
                {
                    Directory.Move(stage, app);
                }
                catch
                {
                    if (!Directory.Exists(app) && Directory.Exists(swapTarget))
                        Directory.Move(swapTarget, app);
                    throw;
                }
                if (swapTarget == replaced && Directory.Exists(replaced))
                {
                    try { Directory.Delete(replaced, true); }
                    catch (Exception cleanupErr)
                    {
                        Console.WriteLine("Aviso: não foi possível remover a pasta temporária anterior (" + replaced + "): " + cleanupErr.Message);
                    }
                }
            }
            finally
            {
                if (Directory.Exists(stage))
                {
                    try { Directory.Delete(stage, true); } catch { }
                }
            }
        }
        Console.WriteLine("Equilíbrio v" + To + " instalado. Já podes voltar a abrir a aplicação.");
        Console.WriteLine("Cópia da versão anterior: " + rollback);
    }

    private static void RequireClosed(string installRoot)
    {
        var normalizedRoot = Path.GetFullPath(installRoot).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var processes = Process.GetProcessesByName("Equilibrio");
        try
        {
            foreach (var process in processes)
            {
                bool matchesInstall = true;
                try
                {
                    var module = process.MainModule;
                    var exePath = module != null ? module.FileName : null;
                    if (!string.IsNullOrEmpty(exePath))
                        matchesInstall = Path.GetFullPath(exePath).StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase);
                }
                catch
                {
                    matchesInstall = true;
                }
                if (matchesInstall)
                    throw new InvalidOperationException("Fecha todas as janelas do Equilíbrio e volta a executar a atualização.");
            }
        }
        finally { foreach (var process in processes) process.Dispose(); }
    }

    private static string Version(string directory)
    {
        string package = Path.Combine(directory, "package.json");
        Regular(package);
        string text = File.ReadAllText(package, Encoding.UTF8);
        var match = Regex.Match(text, @"^\s*\{[\s\S]*?""name""\s*:\s*""[^""]*""[\s\S]*?""version""\s*:\s*""([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?)""");
        if (!match.Success)
            match = Regex.Match(text, @"""version""\s*:\s*""([0-9]+\.[0-9]+\.[0-9]+)""");
        return match.Groups[1].Value;
    }

    private static void Regular(string path)
    {
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new IOException("Ligação inesperada na pasta de instalação: " + path);
    }

    private static string Target(string root, string relative)
    {
        if (!Regex.IsMatch(relative, @"^[A-Za-z0-9_. /-]+$") ||
            relative.Split('/').Any(part => part.Length == 0 || part == "." || part == ".." || part.EndsWith(".") || part.EndsWith(" ")))
            throw new InvalidDataException("Caminho inválido no manifesto.");
        return Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
    }

    private static Dictionary<string, string> ReadManifest(ZipArchive zip)
    {
        var hashes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        using (var reader = new StreamReader(zip.GetEntry("sha256.txt").Open(), Encoding.UTF8))
        {
            string line;
            while ((line = reader.ReadLine()) != null)
            {
                int space = line.IndexOf(' ');
                if (space != 64 || !Regex.IsMatch(line.Substring(0, space), "^[a-f0-9]{64}$"))
                    throw new InvalidDataException("Manifesto inválido.");
                hashes.Add(line.Substring(space + 1), line.Substring(0, space));
            }
        }
        if (!hashes.ContainsKey("package.json") || !hashes.ContainsKey("desktop/version.cjs"))
            throw new InvalidDataException("Manifesto incompleto.");
        return hashes;
    }

    private static bool TryVerify(string root, Dictionary<string, string> manifest)
    {
        try { Verify(root, manifest); return true; }
        catch { return false; }
    }

    private static void Verify(string root, Dictionary<string, string> manifest)
    {
        using (var sha = SHA256.Create())
            foreach (var item in manifest)
            {
                string file = Target(root, item.Key);
                Regular(file);
                using (var input = File.OpenRead(file))
                {
                    string hash = BitConverter.ToString(sha.ComputeHash(input)).Replace("-", "").ToLowerInvariant();
                    if (hash != item.Value) throw new InvalidDataException("Recurso divergente: " + item.Key);
                }
            }
    }

    private static void CopyTree(string source, string destination)
    {
        Regular(source);
        Directory.CreateDirectory(destination);
        foreach (var file in Directory.GetFiles(source))
        {
            Regular(file);
            File.Copy(file, Path.Combine(destination, Path.GetFileName(file)));
        }
        foreach (var folder in Directory.GetDirectories(source))
            CopyTree(folder, Path.Combine(destination, Path.GetFileName(folder)));
    }
}
