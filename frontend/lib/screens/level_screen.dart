import 'package:flutter/material.dart';
import '../config/app_config.dart';
import '../services/review_device_pairing_service.dart';
import 'lesson_list_screen.dart';
import 'review_device_pairing_screen.dart';
import 'training_access_screen.dart';

enum _LevelSettingsAction { pairDevice, unlinkDevice, about }

class LevelScreen extends StatefulWidget {
  final ReviewDevicePairingService? pairingService;
  final WidgetBuilder? pairingScreenBuilder;

  const LevelScreen({
    super.key,
    this.pairingService,
    this.pairingScreenBuilder,
  });

  @override
  State<LevelScreen> createState() => _LevelScreenState();
}

class _LevelScreenState extends State<LevelScreen> {
  final List<String> niveles = const ['Kana', 'N5', 'N4', 'N3', 'N2', 'N1'];

  late final ReviewDevicePairingService _pairingService;
  late final bool _ownsPairingService;

  bool _isCheckingPairing = true;
  bool _isDevicePaired = false;

  @override
  void initState() {
    super.initState();

    _ownsPairingService = widget.pairingService == null;
    _pairingService = widget.pairingService ?? ReviewDevicePairingService();

    _refreshPairingState();
  }

  @override
  void dispose() {
    if (_ownsPairingService) {
      _pairingService.dispose();
    }

    super.dispose();
  }

  Future<void> _refreshPairingState() async {
    bool isPaired;

    try {
      isPaired = await _pairingService.isDevicePaired();
    } catch (_) {
      isPaired = false;
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _isDevicePaired = isPaired;
      _isCheckingPairing = false;
    });
  }

  String getImageForNivel(String nivel) {
    switch (nivel) {
      case 'N5':
        return 'assets/images/N5.png';
      case 'N4':
        return 'assets/images/N4.png';
      case 'N3':
        return 'assets/images/N3.png';
      case 'N2':
        return 'assets/images/N2.png';
      case 'N1':
        return 'assets/images/N1.png';
      case 'Kana':
        return 'assets/images/Kana.png';
      default:
        return 'assets/images/N5.png';
    }
  }

  bool _isDesktopWidth(double width) {
    return width >= 900;
  }

  int _getCrossAxisCount(double width) {
    // Móvil: mantener 3 botones por fila.
    if (width < 700) {
      return 3;
    }

    // Tablet / ventana intermedia.
    if (width < 900) {
      return 3;
    }

    // PC: los 6 niveles en una sola fila.
    return 6;
  }

  double _getCardAspectRatio(double width) {
    // Móvil: mantener aspecto actual.
    if (width < 700) {
      return 0.72;
    }

    if (width < 900) {
      return 0.78;
    }

    // PC: cards más bajas. Cuanto mayor es este valor,
    // menor altura tiene cada card.
    return 1.12;
  }

  double _getContentMaxWidth(double screenWidth) {
    // PC: ancho suficiente para 6 cards compactas.
    if (screenWidth >= 900) {
      return 1080;
    }

    return screenWidth;
  }

  double _getHorizontalPadding(double screenWidth) {
    if (screenWidth < 420) {
      return 10;
    }

    if (screenWidth < 700) {
      return 12;
    }

    if (screenWidth < 900) {
      return 16;
    }

    return 28;
  }

  double _getGridSpacing(double width) {
    if (width < 700) {
      return 10;
    }

    if (width < 900) {
      return 14;
    }

    // PC: menor separación para que todo entre sin scroll.
    return 10;
  }

  void _openTrainingIa() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const TrainingAccessScreen()),
    );
  }

  void _openLessons(String nivel) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => LessonListScreen(nivel: nivel)),
    );
  }

  Future<void> _openPairingFromSettings() async {
    final pairingBuilder = widget.pairingScreenBuilder;

    final paired = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder:
            pairingBuilder ??
            (_) => ReviewDevicePairingScreen(
              service: _pairingService,
              closeOnSuccess: true,
            ),
      ),
    );

    if (paired == true) {
      await _refreshPairingState();
    }
  }

  Future<void> _confirmUnlinkDevice() async {
    final shouldUnlink = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Desvincular dispositivo'),
          content: const Text(
            'Se eliminará la vinculación local de este dispositivo. '
            'Podrás volver a vincularlo más adelante.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context, false);
              },
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.pop(context, true);
              },
              child: const Text('Desvincular'),
            ),
          ],
        );
      },
    );

    if (shouldUnlink != true) {
      return;
    }

    await _pairingService.forgetDevice();

    if (!mounted) {
      return;
    }

    setState(() {
      _isDevicePaired = false;
    });

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Dispositivo desvinculado.')));
  }

  void _showAboutDialog() {
    showAboutDialog(
      context: context,
      applicationName: 'Kanji App',
      applicationVersion: 'Versión local',
      applicationIcon: const Icon(Icons.school, size: 42),
      children: [
        const Text(
          'Aplicación para practicar escritura japonesa, validar trazos '
          'y recopilar muestras de entrenamiento de forma controlada.',
        ),
        const SizedBox(height: 12),
        Text('Backend configurado: ${AppConfig.baseUrl}'),
        const SizedBox(height: 8),
        Text(
          _isDevicePaired
              ? 'Entrenamiento IA: dispositivo vinculado.'
              : 'Entrenamiento IA: dispositivo no vinculado.',
        ),
      ],
    );
  }

  void _handleSettingsAction(_LevelSettingsAction action) {
    switch (action) {
      case _LevelSettingsAction.pairDevice:
        _openPairingFromSettings();
        break;

      case _LevelSettingsAction.unlinkDevice:
        _confirmUnlinkDevice();
        break;

      case _LevelSettingsAction.about:
        _showAboutDialog();
        break;
    }
  }

  Widget _buildTrainingButton(double contentWidth) {
    final isCompact = contentWidth < 700;
    final isDesktop = _isDesktopWidth(contentWidth);

    final buttonMaxWidth = isCompact ? double.infinity : 320.0;

    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: buttonMaxWidth),
        child: SizedBox(
          width: double.infinity,
          height: isCompact ? 40 : 40,
          child: ElevatedButton.icon(
            onPressed: _openTrainingIa,
            icon: Icon(Icons.psychology, size: isCompact ? 18 : 18),
            label: const Text(
              'Entrenamiento IA',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            style: ElevatedButton.styleFrom(
              textStyle: TextStyle(
                fontSize: isDesktop
                    ? 14
                    : isCompact
                    ? 14
                    : 16,
                fontWeight: FontWeight.w500,
              ),
              padding: EdgeInsets.symmetric(horizontal: isCompact ? 12 : 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLevelCard(String nivel, double contentWidth) {
    final isCompact = contentWidth < 700;
    final isDesktop = _isDesktopWidth(contentWidth);

    final radius = isCompact ? 12.0 : 14.0;
    final tagFontSize = isCompact ? 8.0 : 8.0;
    final titleFontSize = isCompact ? 12.0 : 13.0;

    final tagPadding = isCompact
        ? const EdgeInsets.symmetric(horizontal: 5, vertical: 2)
        : const EdgeInsets.symmetric(horizontal: 6, vertical: 2);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(radius),
        onTap: () => _openLessons(nivel),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.15),
                blurRadius: isDesktop ? 5 : 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(radius),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.asset(getImageForNivel(nivel), fit: BoxFit.cover),

                Positioned(
                  top: isCompact ? 5 : 6,
                  left: isCompact ? 5 : 6,
                  child: Container(
                    padding: tagPadding,
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.62),
                      borderRadius: BorderRadius.circular(7),
                    ),
                    child: Text(
                      nivel == 'Kana' ? 'BÁSICO' : 'JLPT',
                      style: TextStyle(
                        fontSize: tagFontSize,
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),

                Align(
                  alignment: Alignment.bottomCenter,
                  child: Container(
                    width: double.infinity,
                    padding: EdgeInsets.fromLTRB(
                      4,
                      isCompact ? 18 : 20,
                      4,
                      isCompact ? 6 : 7,
                    ),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.74),
                          Colors.black.withValues(alpha: 0.0),
                        ],
                      ),
                    ),
                    child: Text(
                      nivel == 'Kana' ? 'Kana' : 'JLPT $nivel',
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: titleFontSize,
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'NotoSansJP',
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLevelGrid(double contentWidth) {
    final crossAxisCount = _getCrossAxisCount(contentWidth);
    final cardAspectRatio = _getCardAspectRatio(contentWidth);
    final spacing = _getGridSpacing(contentWidth);

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: niveles.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        mainAxisSpacing: spacing,
        crossAxisSpacing: spacing,
        childAspectRatio: cardAspectRatio,
      ),
      itemBuilder: (context, index) {
        final nivel = niveles[index];
        return _buildLevelCard(nivel, contentWidth);
      },
    );
  }

  Widget _buildSettingsMenu() {
    return PopupMenuButton<_LevelSettingsAction>(
      tooltip: 'Settings',
      icon: const Icon(Icons.settings),
      onSelected: _handleSettingsAction,
      itemBuilder: (context) {
        return [
          if (!_isDevicePaired)
            const PopupMenuItem<_LevelSettingsAction>(
              value: _LevelSettingsAction.pairDevice,
              child: ListTile(
                leading: Icon(Icons.link),
                title: Text('Vincular dispositivo'),
                contentPadding: EdgeInsets.zero,
              ),
            ),
          if (_isDevicePaired)
            const PopupMenuItem<_LevelSettingsAction>(
              value: _LevelSettingsAction.unlinkDevice,
              child: ListTile(
                leading: Icon(Icons.link_off),
                title: Text('Desvincular dispositivo'),
                contentPadding: EdgeInsets.zero,
              ),
            ),
          const PopupMenuDivider(),
          const PopupMenuItem<_LevelSettingsAction>(
            value: _LevelSettingsAction.about,
            child: ListTile(
              leading: Icon(Icons.info_outline),
              title: Text('Acerca de'),
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ];
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Selecciona nivel'),
        actions: [_buildSettingsMenu()],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final screenWidth = constraints.maxWidth;
            final contentMaxWidth = _getContentMaxWidth(screenWidth);
            final horizontalPadding = _getHorizontalPadding(screenWidth);
            final isDesktop = _isDesktopWidth(screenWidth);

            final verticalPadding = isDesktop ? 14.0 : 12.0;
            final trainingSpacing = isDesktop ? 14.0 : 16.0;

            return SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                verticalPadding,
                horizontalPadding,
                24,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: contentMaxWidth),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_isDevicePaired) ...[
                        _buildTrainingButton(contentMaxWidth),
                        SizedBox(height: trainingSpacing),
                      ] else if (_isCheckingPairing) ...[
                        const Center(
                          child: Padding(
                            padding: EdgeInsets.symmetric(vertical: 10),
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        ),
                        SizedBox(height: trainingSpacing),
                      ],
                      _buildLevelGrid(contentMaxWidth),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
