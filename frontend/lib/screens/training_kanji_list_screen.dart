import 'package:flutter/material.dart';

import 'test_screen.dart';

class TrainingKanjiListScreen extends StatefulWidget {
  final String title;
  final List<String> kanjis;

  const TrainingKanjiListScreen({
    super.key,
    required this.title,
    required this.kanjis,
  });

  @override
  State<TrainingKanjiListScreen> createState() =>
      _TrainingKanjiListScreenState();
}

class _TrainingKanjiListScreenState extends State<TrainingKanjiListScreen> {
  bool _isDesktopWidth(double screenWidth) {
    return screenWidth >= 900;
  }

  double _getContentMaxWidth(double screenWidth) {
    if (screenWidth >= 1200) {
      return 900;
    }

    if (screenWidth >= 900) {
      return 820;
    }

    return screenWidth;
  }

  EdgeInsets _getGridPadding(double screenWidth) {
    if (_isDesktopWidth(screenWidth)) {
      return const EdgeInsets.fromLTRB(24, 24, 24, 32);
    }

    return const EdgeInsets.all(16);
  }

  int _getCrossAxisCount(double effectiveWidth) {
    if (effectiveWidth >= 850) {
      return 6;
    }

    return 5;
  }

  double _getGridSpacing(double effectiveWidth) {
    if (effectiveWidth >= 850) {
      return 14;
    }

    return 12;
  }

  double _getKanjiFontSize(double effectiveWidth) {
    if (effectiveWidth >= 850) {
      return 40;
    }

    return 36;
  }

  void _openKanjiTest(int index) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            TestScreen(kanjiList: widget.kanjis, initialIndex: index),
      ),
    );
  }

  Widget _buildKanjiCard({
    required String kanji,
    required int index,
    required double effectiveWidth,
  }) {
    final fontSize = _getKanjiFontSize(effectiveWidth);
    final isDesktop = effectiveWidth >= 850;

    return InkWell(
      borderRadius: BorderRadius.circular(isDesktop ? 14 : 10),
      onTap: () => _openKanjiTest(index),
      child: Card(
        elevation: isDesktop ? 2 : 3,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(isDesktop ? 14 : 10),
        ),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                kanji,
                style: TextStyle(
                  fontSize: fontSize,
                  fontWeight: FontWeight.bold,
                  fontFamily: 'NotoSansJP',
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return const Center(child: CircularProgressIndicator());
  }

  Widget _buildKanjiGrid({
    required double screenWidth,
    required double effectiveWidth,
  }) {
    final crossAxisCount = _getCrossAxisCount(effectiveWidth);
    final spacing = _getGridSpacing(effectiveWidth);
    final padding = _getGridPadding(screenWidth);

    return GridView.builder(
      padding: padding,
      itemCount: widget.kanjis.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        crossAxisSpacing: spacing,
        mainAxisSpacing: spacing,
        childAspectRatio: 1,
      ),
      itemBuilder: (context, index) {
        final kanji = widget.kanjis[index];

        return _buildKanjiCard(
          kanji: kanji,
          index: index,
          effectiveWidth: effectiveWidth,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: widget.kanjis.isEmpty
          ? _buildEmptyState()
          : SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final screenWidth = constraints.maxWidth;
                  final contentMaxWidth = _getContentMaxWidth(screenWidth);
                  final isDesktop = _isDesktopWidth(screenWidth);

                  if (!isDesktop) {
                    return _buildKanjiGrid(
                      screenWidth: screenWidth,
                      effectiveWidth: screenWidth,
                    );
                  }

                  return Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: contentMaxWidth),
                      child: _buildKanjiGrid(
                        screenWidth: screenWidth,
                        effectiveWidth: contentMaxWidth,
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
