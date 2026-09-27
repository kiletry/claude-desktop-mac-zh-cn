import SwiftUI

@main
struct ClaudeChineseGeneratorApp: App {
    @StateObject private var viewModel = GeneratorViewModel()

    var body: some Scene {
        WindowGroup("Claude 中文生成器") {
            GeneratorWindow(viewModel: viewModel)
                .frame(minWidth: 620, minHeight: 520)
        }
    }
}

private struct GeneratorWindow: View {
    @ObservedObject var viewModel: GeneratorViewModel
    @State private var replacementAlertPresented = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Claude 中文生成器")
                .font(.largeTitle.bold())
            inspectionCard
            configurationSection
            statusSection
            limitations
            Spacer(minLength: 0)
            actionArea
        }
        .padding(28)
        .alert("覆盖现有中文副本？", isPresented: $replacementAlertPresented) {
            Button("取消", role: .cancel) { viewModel.dismissReplacementConfirmation() }
            Button(viewModel.configuration.appMode == .official ? "确认修改官方 Claude" : "确认覆盖", role: .destructive) {
                Task { await viewModel.confirmAndGenerate() }
            }
        } message: {
            Text(viewModel.configuration.appMode == .official ? "这会备份并修改官方 /Applications/Claude.app，可能破坏官方签名、Gatekeeper、Cowork 和自动更新。" : "这会更新 /Applications/Claude 中文.app；不会修改官方 Claude.app。")
        }
        .task { await viewModel.check() }
        .onChange(of: viewModel.state) { state in
            replacementAlertPresented = state == .confirmingReplacement
        }
    }

    private var configurationSection: some View {
        GroupBox("生成选项") {
            VStack(alignment: .leading, spacing: 10) {
                Picker("应用模式", selection: $viewModel.configuration.appMode) {
                    ForEach(AppMode.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                Picker("翻译模式", selection: $viewModel.configuration.translationMode) {
                    ForEach(TranslationMode.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                HStack {
                    Text("备份目录")
                    Text(viewModel.configuration.backupDirectoryURL.path).font(.caption).lineLimit(1)
                    Button("选择…") { viewModel.chooseBackupDirectory() }
                }
                Picker("备份策略", selection: $viewModel.configuration.backupPolicy) {
                    ForEach(BackupPolicy.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                Stepper("保留备份数量：\(viewModel.configuration.backupCount)", value: $viewModel.configuration.backupCount, in: 1...99)
                if viewModel.configuration.appMode == .official {
                    Text("官方模式会修改原始 Claude.app，生成前必须再次确认。").font(.caption).foregroundStyle(.orange)
                }
            }
        }
    }

    private var inspectionCard: some View {
        GroupBox("官方 Claude（只读检查）") {
            switch viewModel.state {
            case let .ready(inspection):
                Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 6) {
                    GridRow { Text("版本"); Text(inspection.version) }
                    GridRow { Text("Bundle ID"); Text(inspection.bundleIdentifier) }
                    GridRow { Text("签名"); Text(inspection.signingVerified ? "已验证" : "未验证") }
                    GridRow { Text("Gatekeeper"); Text(inspection.gatekeeperAccepted ? "已接受" : "未接受") }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            case .checking:
                Label("正在检查 /Applications/Claude.app…", systemImage: "magnifyingglass")
            case .failed:
                Label("检查未通过", systemImage: "xmark.octagon.fill").foregroundStyle(.red)
            default:
                Text("检查结果会显示在这里。")
            }
        }
    }

    private var statusSection: some View {
        Group {
            switch viewModel.state {
            case let .generating(progress):
                VStack(alignment: .leading, spacing: 8) {
                    ProgressView()
                    Text("\(progress.stage)：\(progress.message)")
                }
            case let .completed(summary):
                Label("已生成：\(summary.appPath)", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            case let .failed(error):
                VStack(alignment: .leading, spacing: 6) {
                    Label(error.message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red)
                    if !error.details.isEmpty { Text(error.details).font(.caption).textSelection(.enabled) }
                }
            default: EmptyView()
            }
        }
    }

    private var limitations: some View {
        GroupBox("使用限制与第三方工具") {
            Text("中文副本是独立、临时签名的应用。它可能不通过官方 Team ID、Gatekeeper、公证、Cowork 或 Claude Code 的安装校验。Cockpit Tools 和 CC Switch 可能仍写入官方配置目录；需要 API/Gateway 时请将工具指向中文副本及其独立数据目录。需要官方 Team ID、Cowork 或 Claude Code 时，请继续使用官方 Claude.app。")
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var actionArea: some View {
        HStack {
            switch viewModel.state {
            case .ready, .confirmingReplacement:
                Button(viewModel.configuration.appMode == .official ? "备份并修改官方 Claude" : "生成/更新中文副本") { Task { await viewModel.confirmAndGenerate() } }
                    .buttonStyle(.borderedProminent)
            case .failed:
                Button("重新检查官方 Claude") { Task { await viewModel.check() } }
                    .buttonStyle(.borderedProminent)
            case .generating:
                Button("取消生成", role: .destructive) { viewModel.cancelGeneration() }
            case .completed:
                Button(viewModel.configuration.appMode == .official ? "打开官方 Claude" : "打开 Claude 中文") { viewModel.openGeneratedApp() }.buttonStyle(.borderedProminent)
                if viewModel.configuration.appMode == .clone { Button("打开配置目录") { viewModel.openDataDirectory() } }
            default:
                ProgressView().controlSize(.small)
            }
            Spacer()
            Button("查看日志") { viewModel.revealLog() }
        }
    }
}
