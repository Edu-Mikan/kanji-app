import 'package:flutter/material.dart';

import '../config/app_config.dart';
import 'lesson_list_screen.dart';
import 'training_category_screen.dart';

class LevelScreen extends StatefulWidget {
  const LevelScreen({super.key});

  @override
  State<LevelScreen> createState() => _LevelScreenState();
}

class _LevelScreenState extends State<LevelScreen> {
  final List<String> niveles = const ['Kana', 'N5', 'N4', 'N3', 'N2', 'N1'];

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
      MaterialPageRoute(builder: (_) => const TrainingCategoryScreen()),
    );
  }

  void _openLessons(String nivel) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => LessonListScreen(nivel: nivel)),
    );
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Selecciona nivel')),
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
                      if (AppConfig.testModeEnabled) ...[
                        _buildTrainingButton(contentMaxWidth),
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
