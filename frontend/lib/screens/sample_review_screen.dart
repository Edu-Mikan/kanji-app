import 'package:flutter/material.dart';
import 'package:kanji_app/models/review_sample.dart';
import 'package:kanji_app/services/sample_review_service.dart';
import 'package:kanji_app/widgets/stroke_preview.dart';
import 'package:kanji_app/services/review_device_pairing_service.dart';
import 'sample_review_detail_screen.dart';

class SampleReviewScreen extends StatefulWidget {
  final SampleReviewService? service;
  final String kanji;
  final int pageSize;
  final ReviewDevicePairingService? pairingService;

  const SampleReviewScreen({
    super.key,
    this.service,
    this.pairingService,
    required this.kanji,
    this.pageSize = 20,
  });

  @override
  State<SampleReviewScreen> createState() => _SampleReviewScreenState();
}

class _SampleReviewScreenState extends State<SampleReviewScreen> {
  late final SampleReviewService _service;
  late final bool _ownsService;
  late final ReviewDevicePairingService _pairingService;
  late final bool _ownsPairingService;

  ReviewSamplePage? _result;
  String _status = 'pending';
  String _label = 'all';

  bool _isLoading = false;
  String? _errorMessage;

  int _currentPage = 1;

  @override
  void initState() {
    super.initState();

    _ownsService = widget.service == null;

    _service = widget.service ?? SampleReviewService();

    _ownsPairingService = widget.pairingService == null;

    _pairingService = widget.pairingService ?? ReviewDevicePairingService();
  }

  @override
  void dispose() {
    if (_ownsService) {
      _service.dispose();
    }

    if (_ownsPairingService) {
      _pairingService.dispose();
    }

    super.dispose();
  }

  Future<void> _loadSamples({int? page}) async {
    if (_isLoading) {
      return;
    }

    final kanji = widget.kanji.trim();
    final deviceToken = await _pairingService.readDeviceToken();

    if (deviceToken == null || deviceToken.trim().isEmpty) {
      setState(() {
        _errorMessage =
            'Este dispositivo no está vinculado. Vuelve a Entrenamiento IA para vincularlo.';
      });

      return;
    }

    if (kanji.isEmpty) {
      setState(() {
        _errorMessage = 'Introduce un kanji.';
      });

      return;
    }

    final requestedPage = page ?? _currentPage;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final result = await _service.getSamples(
        deviceToken: deviceToken,
        kanji: kanji,
        status: _status,
        label: _label,
        page: requestedPage,
        pageSize: widget.pageSize,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _result = result;
        _currentPage = result.page;
      });
    } on SampleReviewException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = _buildErrorMessage(error);
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = 'Se produjo un error inesperado.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  String _buildErrorMessage(SampleReviewException error) {
    switch (error.code) {
      case 'review_admin_key_required':
      case 'review_key_required':
        return 'La clave de revisión es obligatoria.';

      case 'review_admin_key_invalid':
        return 'La clave de revisión no es válida.';

      case 'review_admin_not_configured':
        return 'La administración de revisión '
            'no está configurada en el backend.';

      case 'review_storage_unavailable':
        return 'MongoDB no está disponible en este momento.';

      case 'network_error':
        return 'No se pudo conectar con el backend.';

      case 'kanji_required':
        return 'El kanji es obligatorio.';

      case 'device_token_required':
      case 'review_authorization_required':
        return 'Este dispositivo no está vinculado.';

      case 'review_device_token_invalid':
        return 'El token de este dispositivo no es válido. Vincula el dispositivo de nuevo.';

      case 'review_device_token_revoked':
        return 'Este dispositivo ha sido revocado.';

      case 'review_device_permission_denied':
        return 'Este dispositivo no tiene permiso para consultar muestras.';

      default:
        return error.message;
    }
  }

  Future<void> _applyFilters() async {
    _currentPage = 1;

    await _loadSamples(page: 1);
  }

  Future<void> _goToPreviousPage() async {
    final result = _result;

    if (result == null || !result.hasPreviousPage || _isLoading) {
      return;
    }

    await _loadSamples(page: result.page - 1);
  }

  Future<void> _goToNextPage() async {
    final result = _result;

    if (result == null || !result.hasNextPage || _isLoading) {
      return;
    }

    await _loadSamples(page: result.page + 1);
  }

  Future<void> _openSampleDetail({
    required List<ReviewSample> samples,
    required int index,
  }) async {
    if (samples.isEmpty) {
      return;
    }

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SampleReviewDetailScreen(
          samples: samples,
          initialIndex: index,
          service: _service,
          pairingService: _pairingService,
        ),
      ),
    );

    if (!mounted) {
      return;
    }

    await _loadSamples(page: _currentPage);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Muestras de ${widget.kanji}'),
        actions: [
          IconButton(
            tooltip: 'Recargar',
            onPressed: _isLoading || _result == null
                ? null
                : () {
                    _loadSamples();
                  },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final horizontalPadding = constraints.maxWidth >= 900 ? 24.0 : 12.0;

            return Column(
              children: [
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    horizontalPadding,
                    12,
                    horizontalPadding,
                    8,
                  ),
                  child: _buildFilters(constraints.maxWidth),
                ),
                if (_isLoading) const LinearProgressIndicator(),
                if (_errorMessage != null) _buildErrorMessagePanel(),
                Expanded(child: _buildContent(constraints.maxWidth)),
                if (_result != null) _buildPagination(),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildFilters(double screenWidth) {
    final statusField = DropdownButtonFormField<String>(
      initialValue: _status,
      isExpanded: true,
      decoration: const InputDecoration(
        labelText: 'Estado',
        border: OutlineInputBorder(),
      ),
      items: const [
        DropdownMenuItem(value: 'pending', child: Text('Pendientes')),
        DropdownMenuItem(value: 'approved', child: Text('Aprobadas')),
        DropdownMenuItem(value: 'excluded', child: Text('Excluidas')),
        DropdownMenuItem(
          value: 'needs_review',
          child: Text('Requieren revisión'),
        ),
        DropdownMenuItem(value: 'all', child: Text('Todos los estados')),
      ],
      onChanged: _isLoading
          ? null
          : (value) {
              if (value == null) {
                return;
              }

              setState(() {
                _status = value;
              });
            },
    );

    final labelField = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Etiqueta',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 6),
        SizedBox(
          width: double.infinity,
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment<String>(
                value: 'all',
                label: Text('Todas'),
                icon: Icon(Icons.select_all),
              ),
              ButtonSegment<String>(
                value: 'correct',
                label: Text('Correctas'),
                icon: Icon(Icons.check_circle_outline),
              ),
              ButtonSegment<String>(
                value: 'incorrect',
                label: Text('Incorrectas'),
                icon: Icon(Icons.cancel_outlined),
              ),
            ],
            selected: {_label},
            showSelectedIcon: false,
            onSelectionChanged: _isLoading
                ? null
                : (selection) {
                    if (selection.isEmpty) {
                      return;
                    }

                    setState(() {
                      _label = selection.first;
                    });
                  },
          ),
        ),
      ],
    );

    final searchButton = FilledButton.icon(
      onPressed: _isLoading ? null : _applyFilters,
      icon: const Icon(Icons.search),
      label: const Text('Consultar'),
    );

    if (screenWidth < 1000) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          labelField,
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: statusField),
              const SizedBox(width: 10),
              SizedBox(height: 56, child: searchButton),
            ],
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(flex: 2, child: statusField),
            const SizedBox(width: 12),
            SizedBox(height: 56, child: searchButton),
          ],
        ),
        const SizedBox(height: 12),
        labelField,
      ],
    );
  }

  Widget _buildErrorMessagePanel() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        border: Border.all(color: Colors.red.shade200),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: Colors.red.shade700),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _errorMessage!,
              style: TextStyle(color: Colors.red.shade900),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(double screenWidth) {
    if (_isLoading && _result == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final result = _result;

    if (result == null) {
      return _buildInitialState();
    }

    if (result.items.isEmpty) {
      return _buildEmptyState(result);
    }

    final crossAxisCount = _calculateColumnCount(screenWidth);

    return Column(
      children: [
        _buildSummary(result),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: crossAxisCount,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: screenWidth < 480 ? 0.78 : 0.82,
            ),
            itemCount: result.items.length,
            itemBuilder: (context, index) {
              return _buildSampleCard(
                sample: result.items[index],
                samples: result.items,
                index: index,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildInitialState() {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.fact_check_outlined, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              'Pulsa Consultar para cargar las muestras',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, color: Colors.grey),
            ),
            SizedBox(height: 8),
            Text(
              'Se usará el dispositivo vinculado para consultar las muestras.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(ReviewSamplePage result) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.inbox_outlined, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              'No hay muestras de '
              '${result.kanji} '
              'con estos filtros.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSummary(ReviewSamplePage result) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 6, 14, 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '${result.total} muestras · '
              '${result.correctCountInPage} correctas '
              'y ${result.incorrectCountInPage} '
              'incorrectas en esta página',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Text(
            'Página ${result.page}'
            '/${result.totalPages}',
            style: TextStyle(color: Colors.grey.shade700),
          ),
        ],
      ),
    );
  }

  Widget _buildSampleCard({
    required ReviewSample sample,
    required List<ReviewSample> samples,
    required int index,
  }) {
    final labelColor = sample.isCorrect ? Colors.green : Colors.red;

    final labelText = sample.isCorrect ? 'Correcta' : 'Incorrecta';

    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 2,
      child: InkWell(
        onTap: () {
          _openSampleDetail(samples: samples, index: index);
        },
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: FittedBox(
                  fit: BoxFit.contain,
                  child: StrokePreview(
                    strokes: sample.strokesNormalized,
                    size: 180,
                    semanticsLabel:
                        'Muestra de '
                        '${sample.expectedKanji}, '
                        '$labelText',
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: labelColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      labelText,
                      style: TextStyle(
                        color: labelColor.shade700,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${sample.strokeCount} trazos',
                    style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                  ),
                ],
              ),
              const SizedBox(height: 7),
              Row(
                children: [
                  Text(
                    sample.expectedKanji,
                    style: const TextStyle(
                      fontSize: 24,
                      fontFamily: 'NotoSansJP',
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _formatDate(sample.createdAt),
                      textAlign: TextAlign.end,
                      style: TextStyle(
                        color: Colors.grey.shade700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Tooltip(
                message: sample.recognitionId,
                child: Text(
                  _shortRecognitionId(sample.recognitionId),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 11,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPagination() {
    final result = _result!;

    return SafeArea(
      top: false,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          border: Border(
            top: BorderSide(color: Colors.black.withValues(alpha: 0.08)),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: result.hasPreviousPage && !_isLoading
                    ? _goToPreviousPage
                    : null,
                icon: const Icon(Icons.chevron_left),
                label: const Text('Anterior'),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                '${result.page} / '
                '${result.totalPages}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            Expanded(
              child: FilledButton.icon(
                onPressed: result.hasNextPage && !_isLoading
                    ? _goToNextPage
                    : null,
                icon: const Icon(Icons.chevron_right),
                label: const Text('Siguiente'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  int _calculateColumnCount(double width) {
    if (width >= 1200) {
      return 5;
    }

    if (width >= 900) {
      return 4;
    }

    if (width >= 650) {
      return 3;
    }

    if (width >= 420) {
      return 2;
    }

    return 1;
  }

  String _formatDate(DateTime? value) {
    if (value == null) {
      return 'Fecha desconocida';
    }

    final local = value.toLocal();

    final day = local.day.toString().padLeft(2, '0');

    final month = local.month.toString().padLeft(2, '0');

    final hour = local.hour.toString().padLeft(2, '0');

    final minute = local.minute.toString().padLeft(2, '0');

    return '$day/$month/${local.year} '
        '$hour:$minute';
  }

  String _shortRecognitionId(String recognitionId) {
    if (recognitionId.length <= 18) {
      return recognitionId;
    }

    return '${recognitionId.substring(0, 8)}…'
        '${recognitionId.substring(recognitionId.length - 8)}';
  }
}
