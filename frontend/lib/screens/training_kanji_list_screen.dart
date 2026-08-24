import 'package:flutter/material.dart';

import '../services/review_device_pairing_service.dart';
import '../services/sample_review_service.dart';
import 'test_screen.dart';

enum TrainingKanjiSampleFilter { all, withSamples, withoutSamples }

class TrainingKanjiListScreen extends StatefulWidget {
  final String title;
  final List<String> kanjis;
  final SampleReviewService? sampleReviewService;
  final ReviewDevicePairingService? pairingService;
  final Widget Function(
    BuildContext context,
    List<String> kanjis,
    int initialIndex,
  )?
  testScreenBuilder;

  const TrainingKanjiListScreen({
    super.key,
    required this.title,
    required this.kanjis,
    this.sampleReviewService,
    this.pairingService,
    this.testScreenBuilder,
  });

  @override
  State<TrainingKanjiListScreen> createState() =>
      _TrainingKanjiListScreenState();
}

class _TrainingKanjiListScreenState extends State<TrainingKanjiListScreen> {
  late final SampleReviewService _sampleReviewService;
  late final bool _ownsSampleReviewService;

  late final ReviewDevicePairingService _pairingService;
  late final bool _ownsPairingService;

  ReviewSampleCounts? _sampleCounts;
  TrainingKanjiSampleFilter _filter = TrainingKanjiSampleFilter.all;

  bool _isLoadingCounts = true;
  String? _countsErrorMessage;

  List<String> get _filteredKanjis {
    final counts = _sampleCounts;

    if (counts == null || _filter == TrainingKanjiSampleFilter.all) {
      return List<String>.unmodifiable(widget.kanjis);
    }

    return List<String>.unmodifiable(
      widget.kanjis.where((kanji) {
        final hasSamples = counts.hasSamples(kanji);

        switch (_filter) {
          case TrainingKanjiSampleFilter.all:
            return true;

          case TrainingKanjiSampleFilter.withSamples:
            return hasSamples;

          case TrainingKanjiSampleFilter.withoutSamples:
            return !hasSamples;
        }
      }),
    );
  }

  @override
  void initState() {
    super.initState();

    _ownsSampleReviewService = widget.sampleReviewService == null;

    _sampleReviewService = widget.sampleReviewService ?? SampleReviewService();

    _ownsPairingService = widget.pairingService == null;

    _pairingService = widget.pairingService ?? ReviewDevicePairingService();

    _loadSampleCounts();
  }

  @override
  void dispose() {
    if (_ownsSampleReviewService) {
      _sampleReviewService.dispose();
    }

    if (_ownsPairingService) {
      _pairingService.dispose();
    }

    super.dispose();
  }

  Future<void> _loadSampleCounts() async {
    if (widget.kanjis.isEmpty) {
      if (!mounted) {
        return;
      }

      setState(() {
        _sampleCounts = const ReviewSampleCounts(
          requestedCount: 0,
          withSamplesCount: 0,
          withoutSamplesCount: 0,
          counts: {},
        );

        _isLoadingCounts = false;
        _countsErrorMessage = null;
      });

      return;
    }

    setState(() {
      _isLoadingCounts = true;
      _countsErrorMessage = null;
    });

    try {
      final deviceToken = await _pairingService.readDeviceToken();

      if (deviceToken == null || deviceToken.trim().isEmpty) {
        throw const SampleReviewException(
          code: 'device_token_required',
          message: 'Este dispositivo no está vinculado.',
        );
      }

      final result = await _sampleReviewService.getSampleCounts(
        deviceToken: deviceToken,
        kanjis: widget.kanjis,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _sampleCounts = result;
      });
    } on SampleReviewException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _countsErrorMessage = _buildCountsErrorMessage(error);
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _countsErrorMessage = 'No se pudo consultar el estado de las muestras.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingCounts = false;
        });
      }
    }
  }

  String _buildCountsErrorMessage(SampleReviewException error) {
    switch (error.code) {
      case 'device_token_required':
      case 'review_authorization_required':
        return 'Este dispositivo no está vinculado.';

      case 'review_device_token_invalid':
        return 'La vinculación del dispositivo no es válida.';

      case 'review_device_token_revoked':
        return 'Este dispositivo ha sido revocado.';

      case 'review_device_token_expired':
        return 'La vinculación del dispositivo ha caducado.';

      case 'review_device_permission_denied':
        return 'Este dispositivo no tiene permiso '
            'para consultar las muestras.';

      case 'review_storage_unavailable':
        return 'MongoDB no está disponible en este momento.';

      case 'network_error':
        return 'No se pudo conectar con el backend.';

      default:
        return error.message;
    }
  }

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
      return const EdgeInsets.fromLTRB(24, 16, 24, 32);
    }

    return const EdgeInsets.fromLTRB(16, 12, 16, 24);
  }

  int _getCrossAxisCount(double effectiveWidth) {
    if (effectiveWidth >= 850) {
      return 6;
    }

    if (effectiveWidth >= 650) {
      return 5;
    }

    if (effectiveWidth >= 420) {
      return 4;
    }

    return 3;
  }

  double _getGridSpacing(double effectiveWidth) {
    if (effectiveWidth >= 850) {
      return 14;
    }

    return 10;
  }

  double _getKanjiFontSize(double effectiveWidth) {
    if (effectiveWidth >= 850) {
      return 38;
    }

    return 32;
  }

  void _openKanjiTest({
    required List<String> visibleKanjis,
    required int visibleIndex,
  }) {
    final builder = widget.testScreenBuilder;

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: builder != null
            ? (context) => builder(context, visibleKanjis, visibleIndex)
            : (_) => TestScreen(
                kanjiList: visibleKanjis,
                initialIndex: visibleIndex,
              ),
      ),
    );
  }

  Widget _buildKanjiCard({
    required String kanji,
    required int index,
    required List<String> visibleKanjis,
    required double effectiveWidth,
  }) {
    final fontSize = _getKanjiFontSize(effectiveWidth);

    final isDesktop = effectiveWidth >= 850;

    final count = _sampleCounts?.countFor(kanji);

    final hasSamples = count != null && count > 0;

    return InkWell(
      key: ValueKey('training-kanji-$kanji'),
      borderRadius: BorderRadius.circular(isDesktop ? 14 : 10),
      onTap: () {
        _openKanjiTest(visibleKanjis: visibleKanjis, visibleIndex: index);
      },
      child: Card(
        elevation: isDesktop ? 2 : 3,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(isDesktop ? 14 : 10),
        ),
        child: Padding(
          padding: const EdgeInsets.all(7),
          child: Stack(
            children: [
              Center(
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
              if (!_isLoadingCounts && count != null)
                Positioned(
                  top: 0,
                  right: 0,
                  child: _buildSampleIndicator(
                    kanji: kanji,
                    count: count,
                    hasSamples: hasSamples,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSampleIndicator({
    required String kanji,
    required int count,
    required bool hasSamples,
  }) {
    final backgroundColor = hasSamples
        ? Colors.green.shade50
        : Colors.grey.shade200;

    final foregroundColor = hasSamples
        ? Colors.green.shade800
        : Colors.grey.shade700;

    final text = hasSamples ? count.toString() : '0';

    return Semantics(
      label: hasSamples
          ? '$kanji tiene $count muestras'
          : '$kanji no tiene muestras',
      child: Tooltip(
        message: hasSamples ? '$count muestras' : 'Sin muestras',
        child: Container(
          constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: foregroundColor.withValues(alpha: 0.25)),
          ),
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: foregroundColor,
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final counts = _sampleCounts;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_isLoadingCounts) ...[
            const LinearProgressIndicator(),
            const SizedBox(height: 8),
            const Text(
              'Consultando muestras disponibles...',
              textAlign: TextAlign.center,
            ),
          ] else if (_countsErrorMessage != null) ...[
            _buildCountsError(),
          ] else if (counts != null) ...[
            Text(
              '${counts.withSamplesCount} con muestras · '
              '${counts.withoutSamplesCount} sin muestras',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 10),
            SegmentedButton<TrainingKanjiSampleFilter>(
              segments: const [
                ButtonSegment<TrainingKanjiSampleFilter>(
                  value: TrainingKanjiSampleFilter.all,
                  label: Text('Todos'),
                  icon: Icon(Icons.select_all),
                ),
                ButtonSegment<TrainingKanjiSampleFilter>(
                  value: TrainingKanjiSampleFilter.withSamples,
                  label: Text('Con muestras'),
                  icon: Icon(Icons.check_circle_outline),
                ),
                ButtonSegment<TrainingKanjiSampleFilter>(
                  value: TrainingKanjiSampleFilter.withoutSamples,
                  label: Text('Sin muestras'),
                  icon: Icon(Icons.radio_button_unchecked),
                ),
              ],
              selected: {_filter},
              showSelectedIcon: false,
              onSelectionChanged: (selection) {
                if (selection.isEmpty) {
                  return;
                }

                setState(() {
                  _filter = selection.first;
                });
              },
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCountsError() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        border: Border.all(color: Colors.orange.shade200),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_outlined, color: Colors.orange.shade800),
          const SizedBox(width: 10),
          Expanded(child: Text(_countsErrorMessage!)),
          IconButton(
            tooltip: 'Reintentar conteos',
            onPressed: _loadSampleCounts,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    final message = widget.kanjis.isEmpty
        ? 'No hay kanjis en esta categoría.'
        : 'No hay kanjis que coincidan con el filtro.';

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.inbox_outlined, size: 56, color: Colors.grey),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 17),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildKanjiGrid({
    required double screenWidth,
    required double effectiveWidth,
  }) {
    final visibleKanjis = _filteredKanjis;

    if (visibleKanjis.isEmpty) {
      return _buildEmptyState();
    }

    final crossAxisCount = _getCrossAxisCount(effectiveWidth);

    final spacing = _getGridSpacing(effectiveWidth);

    final padding = _getGridPadding(screenWidth);

    return GridView.builder(
      padding: padding,
      itemCount: visibleKanjis.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        crossAxisSpacing: spacing,
        mainAxisSpacing: spacing,
        childAspectRatio: 1,
      ),
      itemBuilder: (context, index) {
        final kanji = visibleKanjis[index];

        return _buildKanjiCard(
          kanji: kanji,
          index: index,
          visibleKanjis: visibleKanjis,
          effectiveWidth: effectiveWidth,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: 'Actualizar conteos',
            onPressed: _isLoadingCounts ? null : _loadSampleCounts,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
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
          ],
        ),
      ),
    );
  }
}
