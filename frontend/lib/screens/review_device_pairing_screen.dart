import 'package:flutter/material.dart';
import 'package:kanji_app/services/review_device_pairing_service.dart';

class ReviewDevicePairingScreen extends StatefulWidget {
  final ReviewDevicePairingService? service;
  final String defaultDeviceName;
  final bool closeOnSuccess;

  const ReviewDevicePairingScreen({
    super.key,
    this.service,
    this.defaultDeviceName = 'Dispositivo de revisión',
    this.closeOnSuccess = true,
  });

  @override
  State<ReviewDevicePairingScreen> createState() =>
      _ReviewDevicePairingScreenState();
}

class _ReviewDevicePairingScreenState extends State<ReviewDevicePairingScreen> {
  late final ReviewDevicePairingService _service;
  late final bool _ownsService;

  late final TextEditingController _reviewKeyController;
  late final TextEditingController _deviceNameController;

  bool _isPairing = false;
  bool _hideReviewKey = true;
  String? _errorMessage;
  String? _successMessage;

  @override
  void initState() {
    super.initState();

    _ownsService = widget.service == null;
    _service = widget.service ?? ReviewDevicePairingService();

    _reviewKeyController = TextEditingController();
    _deviceNameController = TextEditingController(
      text: widget.defaultDeviceName,
    );
  }

  @override
  void dispose() {
    _reviewKeyController.dispose();
    _deviceNameController.dispose();

    if (_ownsService) {
      _service.dispose();
    }

    super.dispose();
  }

  Future<void> _pairDevice() async {
    if (_isPairing) {
      return;
    }

    final reviewKey = _reviewKeyController.text.trim();
    final deviceName = _deviceNameController.text.trim();

    if (reviewKey.isEmpty) {
      setState(() {
        _errorMessage = 'Introduce la clave de emparejamiento.';
        _successMessage = null;
      });

      return;
    }

    setState(() {
      _isPairing = true;
      _errorMessage = null;
      _successMessage = null;
    });

    try {
      final result = await _service.pairDevice(
        reviewKey: reviewKey,
        deviceName: deviceName,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _successMessage =
            'Dispositivo vinculado correctamente. '
            'Permisos: ${result.permissions.join(", ")}.';
      });

      if (widget.closeOnSuccess) {
        Navigator.pop(context, true);
      }
    } on ReviewDevicePairingException catch (error) {
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
          _isPairing = false;
        });
      }
    }
  }

  String _buildErrorMessage(ReviewDevicePairingException error) {
    switch (error.code) {
      case 'review_key_required':
        return 'La clave de emparejamiento es obligatoria.';

      case 'review_admin_key_invalid':
        return 'La clave de emparejamiento no es válida.';

      case 'review_admin_not_configured':
        return 'El backend no tiene configurada la clave de revisión.';

      case 'review_device_storage_unavailable':
        return 'El almacenamiento de dispositivos no está disponible.';

      case 'network_error':
        return 'No se pudo conectar con el backend.';

      case 'invalid_json':
      case 'invalid_response':
      case 'empty_response':
        return 'La respuesta del backend no es válida.';
      case 'device_token_storage_failed':
        return 'El dispositivo se vinculó, pero no se pudo guardar el token en este dispositivo.';
      default:
        return error.message;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Vincular dispositivo')),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final contentMaxWidth = constraints.maxWidth >= 900
                ? 560.0
                : constraints.maxWidth;

            return SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 28),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: contentMaxWidth),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildIntro(),
                      const SizedBox(height: 20),
                      _buildDeviceNameField(),
                      const SizedBox(height: 14),
                      _buildReviewKeyField(),
                      const SizedBox(height: 18),
                      if (_errorMessage != null) ...[
                        _buildMessagePanel(
                          icon: Icons.error_outline,
                          text: _errorMessage!,
                          backgroundColor: Colors.red.shade50,
                          borderColor: Colors.red.shade200,
                          iconColor: Colors.red.shade700,
                          textColor: Colors.red.shade900,
                        ),
                        const SizedBox(height: 14),
                      ],
                      if (_successMessage != null) ...[
                        _buildMessagePanel(
                          icon: Icons.check_circle_outline,
                          text: _successMessage!,
                          backgroundColor: Colors.green.shade50,
                          borderColor: Colors.green.shade200,
                          iconColor: Colors.green.shade700,
                          textColor: Colors.green.shade900,
                        ),
                        const SizedBox(height: 14),
                      ],
                      FilledButton.icon(
                        onPressed: _isPairing ? null : _pairDevice,
                        icon: _isPairing
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.link),
                        label: Text(
                          _isPairing ? 'Vinculando...' : 'Vincular dispositivo',
                        ),
                      ),
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

  Widget _buildIntro() {
    return Card(
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.security, color: Colors.blue.shade700),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Introduce la clave de emparejamiento una sola vez. '
                'La aplicación guardará un token de dispositivo de forma segura '
                'y lo usará automáticamente para el modo Entrenamiento IA.',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeviceNameField() {
    return TextField(
      controller: _deviceNameController,
      textInputAction: TextInputAction.next,
      decoration: const InputDecoration(
        labelText: 'Nombre del dispositivo',
        hintText: 'Móvil Eduardo',
        prefixIcon: Icon(Icons.phone_android),
        border: OutlineInputBorder(),
      ),
    );
  }

  Widget _buildReviewKeyField() {
    return TextField(
      controller: _reviewKeyController,
      obscureText: _hideReviewKey,
      autocorrect: false,
      enableSuggestions: false,
      textInputAction: TextInputAction.done,
      decoration: InputDecoration(
        labelText: 'Clave de emparejamiento',
        hintText: 'REVIEW_ADMIN_KEY',
        prefixIcon: const Icon(Icons.key),
        suffixIcon: IconButton(
          tooltip: _hideReviewKey ? 'Mostrar clave' : 'Ocultar clave',
          onPressed: () {
            setState(() {
              _hideReviewKey = !_hideReviewKey;
            });
          },
          icon: Icon(_hideReviewKey ? Icons.visibility : Icons.visibility_off),
        ),
        border: const OutlineInputBorder(),
      ),
      onSubmitted: (_) {
        _pairDevice();
      },
    );
  }

  Widget _buildMessagePanel({
    required IconData icon,
    required String text,
    required Color backgroundColor,
    required Color borderColor,
    required Color iconColor,
    required Color textColor,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: TextStyle(color: textColor)),
          ),
        ],
      ),
    );
  }
}
