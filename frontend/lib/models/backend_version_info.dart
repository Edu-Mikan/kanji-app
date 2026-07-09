class BackendVersionInfo {
  final String app;
  final String version;
  final String environment;
  final String gitCommitShort;
  final String gitBranch;
  final String serverStartedAt;

  BackendVersionInfo({
    required this.app,
    required this.version,
    required this.environment,
    required this.gitCommitShort,
    required this.gitBranch,
    required this.serverStartedAt,
  });

  factory BackendVersionInfo.fromJson(Map<String, dynamic> json) {
    return BackendVersionInfo(
      app: json['app']?.toString() ?? 'unknown',
      version: json['version']?.toString() ?? 'unknown',
      environment: json['environment']?.toString() ?? 'unknown',
      gitCommitShort: json['gitCommitShort']?.toString() ?? 'unknown',
      gitBranch: json['gitBranch']?.toString() ?? 'unknown',
      serverStartedAt: json['serverStartedAt']?.toString() ?? 'unknown',
    );
  }

  String get displayText {
    return 'Backend v$version ($gitCommitShort)';
  }

  String get detailText {
    return '$gitBranch · $environment';
  }
}
