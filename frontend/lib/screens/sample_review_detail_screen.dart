import 'package:flutter/material.dart';
import 'package:kanji_app/models/review_sample.dart';
import 'package:kanji_app/services/review_device_pairing_service.dart';
import 'package:kanji_app/services/sample_review_service.dart';
import 'package:kanji_app/widgets/stroke_preview.dart';

class SampleReviewDetailScreen extends StatefulWidget {
  final List<ReviewSample> samples;
  final int initialIndex;
  final SampleReviewService? service;
  final ReviewDevicePairingService? pairingService;

  const SampleReviewDetailScreen({
    super.key,
    required this.samples,
    required this.initialIndex,
    this.service,
    this.pairingService,
  });

  @override
  State<SampleReviewDetailScreen> createState() =>
      _SampleReviewDetailScreenState();
}

class _SampleReviewDetailScreenState extends State<SampleReviewDetailScreen> {
  late final SampleReviewService _service;
  late final bool _ownsService;

  late final ReviewDevicePairingService _pairingService;
  late final bool _ownsPairingService;

  late final List<ReviewSample> _samples;

  bool _isUpdatingLabel = false;
  String? _labelUpdateError;
  late int _currentIndex;

  bool get _hasSamples {
    return _samples.isNotEmpty;
  }

  ReviewSample get _currentSample {
    return _samples[_currentIndex];
  }

  bool get _canGoPrevious {
    return _hasSamples && _currentIndex > 0;
  }

  bool get _canGoNext {
    return _hasSamples && _currentIndex < _samples.length - 1;
  }

  @override
  void initState() {
    super.initState();

    _ownsService = widget.service == null;
    _service = widget.service ?? SampleReviewService();

    _ownsPairingService = widget.pairingService == null;
    _pairingService = widget.pairingService ?? ReviewDevicePairingService();

    _samples = List<ReviewSample>.of(widget.samples);

    if (_samples.isEmpty) {
      _currentIndex = 0;
      return;
    }

    _currentIndex = widget.initialIndex.clamp(0, _samples.length - 1);
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

  void _goPrevious() {
    if (!_canGoPrevious) {
      return;
    }

    setState(() {
      _currentIndex--;
    });
  }

  void _goNext() {
    if (!_canGoNext) {
      return;
    }

    setState(() {
      _currentIndex++;
    });
  }

  Future<bool> _confirmLabelChange({required bool newValue}) async {
    final label = newValue ? 'correcta' : 'incorrecta';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Cambiar valoración'),
          content: Text('¿Quieres marcar esta muestra como $label?'),
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
              child: const Text('Confirmar'),
            ),
          ],
        );
      },
    );

    return confirmed == true;
  }

  Future<void> _updateLabel(bool newValue) async {
    if (_isUpdatingLabel) {
      return;
    }

    final currentSample = _currentSample;

    if (currentSample.isCorrect == newValue) {
      return;
    }

    final confirmed = await _confirmLabelChange(newValue: newValue);

    if (!confirmed || !mounted) {
      return;
    }

    final deviceToken = await _pairingService.readDeviceToken();

    if (!mounted) {
      return;
    }

    if (deviceToken == null || deviceToken.trim().isEmpty) {
      setState(() {
        _labelUpdateError = 'Este dispositivo no está vinculado.';
      });

      return;
    }

    setState(() {
      _isUpdatingLabel = true;
      _labelUpdateError = null;
    });

    try {
      final result = await _service.updateSampleLabel(
        deviceToken: deviceToken,
        recognitionId: currentSample.recognitionId,
        isCorrect: newValue,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _samples[_currentIndex] = result.sample;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.changed
                ? 'Valoración actualizada.'
                : 'La muestra ya tenía esa valoración.',
          ),
        ),
      );
    } on SampleReviewException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _labelUpdateError = _buildUpdateErrorMessage(error);
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _labelUpdateError = 'Se produjo un error inesperado.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isUpdatingLabel = false;
        });
      }
    }
  }

  String _buildUpdateErrorMessage(SampleReviewException error) {
    switch (error.code) {
      case 'device_token_required':
      case 'review_authorization_required':
        return 'Este dispositivo no está vinculado.';

      case 'review_device_token_invalid':
        return 'El token del dispositivo no es válido. '
            'Vincula el dispositivo de nuevo.';

      case 'review_device_token_revoked':
        return 'Este dispositivo ha sido revocado.';

      case 'review_device_token_expired':
        return 'La vinculación del dispositivo ha caducado.';

      case 'review_device_permission_denied':
        return 'Este dispositivo no tiene permiso '
            'para modificar valoraciones. '
            'Desvincúlalo y vuelve a vincularlo.';

      case 'review_sample_not_found':
        return 'La muestra ya no existe.';

      case 'review_storage_unavailable':
        return 'MongoDB no está disponible en este momento.';

      case 'network_error':
        return 'No se pudo conectar con el backend.';

      case 'invalid_response':
      case 'invalid_json':
      case 'empty_response':
        return 'La respuesta del backend no es válida.';

      default:
        return error.message;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasSamples) {
      return Scaffold(
        appBar: AppBar(title: const Text('Detalle de muestra')),
        body: const Center(child: Text('No hay muestras para mostrar.')),
      );
    }

    final sample = _currentSample;

    return Scaffold(
      appBar: AppBar(
        title: Text('Muestra ${_currentIndex + 1} de ${_samples.length}'),
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isWide = constraints.maxWidth >= 900;

            if (isWide) {
              return _buildWideLayout(sample);
            }

            return _buildMobileLayout(sample);
          },
        ),
      ),
      bottomNavigationBar: _buildNavigationBar(),
    );
  }

  Widget _buildMobileLayout(ReviewSample sample) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildPreview(sample),
          const SizedBox(height: 16),
          _buildSampleInfo(sample),
        ],
      ),
    );
  }

  Widget _buildWideLayout(ReviewSample sample) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(flex: 3, child: Center(child: _buildPreview(sample))),
          const SizedBox(width: 24),
          Expanded(
            flex: 2,
            child: SingleChildScrollView(child: _buildSampleInfo(sample)),
          ),
        ],
      ),
    );
  }

  Widget _buildPreview(ReviewSample sample) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.of(context).size.width;

        final previewSize = availableWidth.clamp(260.0, 460.0);

        return Center(
          child: StrokePreview(
            strokes: sample.strokesNormalized,
            size: previewSize,
            strokeWidth: 7,
            showStrokeOrder: true,
            semanticsLabel:
                'Muestra de ${sample.expectedKanji}, '
                '${sample.isCorrect ? "correcta" : "incorrecta"}',
          ),
        );
      },
    );
  }

  Widget _buildSampleInfo(ReviewSample sample) {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeader(sample),
            const SizedBox(height: 18),
            _buildLabelEditor(sample),
            if (_labelUpdateError != null) ...[
              const SizedBox(height: 12),
              _buildLabelUpdateError(),
            ],
            const SizedBox(height: 18),
            _buildInfoRow(
              icon: Icons.gesture,
              label: 'Trazos',
              value: '${sample.strokeCount}',
            ),
            _buildInfoRow(
              icon: Icons.event,
              label: 'Fecha',
              value: _formatDate(sample.createdAt),
            ),
            _buildInfoRow(
              icon: Icons.fact_check_outlined,
              label: 'Estado',
              value: sample.datasetReviewStatus,
            ),
            _buildInfoRow(
              icon: Icons.source_outlined,
              label: 'Origen',
              value: sample.source ?? 'desconocido',
            ),
            _buildInfoRow(
              icon: Icons.memory_outlined,
              label: 'Algoritmo',
              value: sample.algorithmVersion ?? 'desconocido',
            ),
            const SizedBox(height: 14),
            const Divider(),
            const SizedBox(height: 10),
            Text(
              'Recognition ID',
              style: TextStyle(
                color: Colors.grey.shade700,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            SelectableText(
              sample.recognitionId,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(ReviewSample sample) {
    final labelColor = sample.isCorrect ? Colors.green : Colors.red;
    final labelText = sample.isCorrect ? 'Correcta' : 'Incorrecta';

    return Wrap(
      spacing: 16,
      runSpacing: 10,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(
          sample.expectedKanji,
          style: const TextStyle(
            fontSize: 48,
            fontWeight: FontWeight.bold,
            fontFamily: 'NotoSansJP',
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: labelColor.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Text(
            labelText,
            style: TextStyle(
              color: labelColor.shade700,
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLabelEditor(ReviewSample sample) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Valoración',
          style: TextStyle(
            color: Colors.grey.shade700,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment<bool>(
              value: true,
              icon: Icon(Icons.check_circle_outline),
              label: Text('Correcta'),
            ),
            ButtonSegment<bool>(
              value: false,
              icon: Icon(Icons.cancel_outlined),
              label: Text('Incorrecta'),
            ),
          ],
          selected: {sample.isCorrect},
          showSelectedIcon: false,
          onSelectionChanged: _isUpdatingLabel
              ? null
              : (selection) {
                  if (selection.isEmpty) {
                    return;
                  }

                  final newValue = selection.first;

                  if (newValue == sample.isCorrect) {
                    return;
                  }

                  _updateLabel(newValue);
                },
        ),
        if (_isUpdatingLabel) ...[
          const SizedBox(height: 10),
          const LinearProgressIndicator(),
          const SizedBox(height: 6),
          const Text('Guardando valoración...', textAlign: TextAlign.center),
        ],
      ],
    );
  }

  Widget _buildLabelUpdateError() {
    return Container(
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
              _labelUpdateError!,
              style: TextStyle(color: Colors.red.shade900),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: Colors.grey.shade700),
          const SizedBox(width: 10),
          SizedBox(
            width: 88,
            child: Text(
              label,
              style: TextStyle(
                color: Colors.grey.shade700,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNavigationBar() {
    return SafeArea(
      top: false,
      child: Container(
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
                onPressed: _canGoPrevious ? _goPrevious : null,
                icon: const Icon(Icons.chevron_left),
                label: const Text('Anterior'),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                _hasSamples
                    ? '${_currentIndex + 1} / ${_samples.length}'
                    : '0 / 0',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            Expanded(
              child: FilledButton.icon(
                onPressed: _canGoNext ? _goNext : null,
                icon: const Icon(Icons.chevron_right),
                label: const Text('Siguiente'),
              ),
            ),
          ],
        ),
      ),
    );
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

    return '$day/$month/${local.year} $hour:$minute';
  }
}
