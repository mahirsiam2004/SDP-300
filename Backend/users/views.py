from rest_framework import status, generics
import os
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from datetime import timedelta
from decimal import Decimal
from urllib import parse as urllib_parse
from urllib import request as urllib_request
from urllib import error as urllib_error
import hashlib
import json
import secrets
from typing import Any, Dict, cast


from .serializers import (UserSerializer, BrandSerializer, RegisterSerializer,
                          BrandRegisterSerializer, LoginSerializer,
                          VerificationSendSerializer, VerificationConfirmSerializer,
                          ForgotPasswordRequestSerializer, ForgotPasswordConfirmSerializer,
                          ProductSerializer, ProductCreateUpdateSerializer,
                          ProductImageSerializer, WishlistSerializer, CartItemSerializer,
                          ReviewSerializer, ReviewCreateSerializer,
                          MessageSerializer, AddressSerializer, ChangePasswordSerializer,
                          OrderSerializer, CheckoutSerializer, GuestCheckoutSerializer, OrderStatusUpdateSerializer,
                          NotificationSerializer)
from .models import Brand, Product, ProductImage, Wishlist, CartItem, Review, Message, Address, Order, OrderItem, Notification, EmailVerificationCode, PasswordResetCode, SSLPayment
from .authentication import BrandUser

User = get_user_model()

VERIFICATION_CODE_LENGTH = 6
VERIFICATION_CODE_EXPIRY_MINUTES = 10
VERIFICATION_RESEND_COOLDOWN_SECONDS = 60
VERIFICATION_MAX_ATTEMPTS = 5
PASSWORD_RESET_CODE_EXPIRY_MINUTES = 10
PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60
PASSWORD_RESET_MAX_ATTEMPTS = 5


def _validated_data(serializer) -> Dict[str, Any]:
    """Return serializer.validated_data with a concrete mapping type for type checkers."""
    return cast(Dict[str, Any], serializer.validated_data)


def _is_account_verified(target: Any, user_type: str) -> bool:
    if user_type == 'user':
        return bool(getattr(target, 'is_email_verified', False))
    return bool(getattr(target, 'is_brand_verified', False))


def _mark_account_verified(target: Any, user_type: str) -> bool:
    if user_type == 'user':
        if not bool(getattr(target, 'is_email_verified', False)):
            setattr(target, 'is_email_verified', True)
            target.save(update_fields=['is_email_verified'])
            return True
        return False

    if not bool(getattr(target, 'is_brand_verified', False)):
        setattr(target, 'is_brand_verified', True)
        target.save(update_fields=['is_brand_verified'])
        return True
    return False


def _is_user_email_verified(user: Any) -> bool:
    return bool(getattr(user, 'is_email_verified', False))

 
def _set_message_sender_brand(message: Message, brand: Any) -> None:
    setattr(message, 'sender_brand', brand)


def _set_message_receiver_brand(message: Message, brand: Any) -> None:
    setattr(message, 'receiver_brand', brand)


def _set_message_receiver_user(message: Message, user: Any) -> None:
    setattr(message, 'receiver_user', user)


def _model_int_id(obj: Any, attr_name: str) -> int | None:
    value = getattr(obj, attr_name, None)
    return value if isinstance(value, int) else None


def _order_display_id(order: Any) -> str:
    order_id = _model_int_id(order, 'id')
    if order_id is not None:
        return str(order_id)
    return str(getattr(order, 'pk', ''))


def _generate_verification_code():
    return f"{secrets.randbelow(10 ** VERIFICATION_CODE_LENGTH):0{VERIFICATION_CODE_LENGTH}d}"


def _hash_verification_code(code):
    return hashlib.sha256(f"{code}:{settings.SECRET_KEY}".encode('utf-8')).hexdigest()


def _send_verification_email(recipient_email, code):
    subject = 'Verify your ShopFlare email'
    message = (
        f"Your ShopFlare verification code is {code}.\n\n"
        f"It expires in {VERIFICATION_CODE_EXPIRY_MINUTES} minutes."
    )
    send_mail(
        subject,
        message,
        getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@shopflare.com'),
        [recipient_email],
        fail_silently=False,
    )


def _send_account_created_email(recipient_email):
    subject = 'Account created successfully'
    message = (
        'Your ShopFlare account has been created and your email is verified.\n\n'
        'You can now log in and start exploring ShopFlare.'
    )
    send_mail(
        subject,
        message,
        getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@shopflare.com'),
        [recipient_email],
        fail_silently=False,
    )


def _issue_verification_code(target, user_type):
    code = _generate_verification_code()
    code_hash = _hash_verification_code(code)
    expires_at = timezone.now() + timedelta(minutes=VERIFICATION_CODE_EXPIRY_MINUTES)

    if user_type == 'user':
        EmailVerificationCode.objects.filter(user=target, is_used=False).update(is_used=True)
        EmailVerificationCode.objects.create(
            user=target,
            code_hash=code_hash,
            expires_at=expires_at,
        )
        recipient_email = target.email
    else:
        EmailVerificationCode.objects.filter(brand=target, is_used=False).update(is_used=True)
        EmailVerificationCode.objects.create(
            brand=target,
            code_hash=code_hash,
            expires_at=expires_at,
        )
        recipient_email = target.email

    _send_verification_email(recipient_email, code)


def _get_verification_target(email, user_type):
    if user_type == 'user':
        return User.objects.filter(email__iexact=email).first()
    return Brand.objects.filter(email__iexact=email).first()


def _get_account_by_email(email):
    user = User.objects.filter(email__iexact=email).first()
    if user:
        return user, 'user'

    brand = Brand.objects.filter(email__iexact=email).first()
    if brand:
        return brand, 'brand'

    return None, None


def _send_password_reset_email(recipient_email, code):
    subject = 'Reset your ShopFlare password'
    message = (
        f"Your ShopFlare password reset code is {code}.\n\n"
        f"It expires in {PASSWORD_RESET_CODE_EXPIRY_MINUTES} minutes."
    )
    send_mail(
        subject,
        message,
        getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@shopflare.com'),
        [recipient_email],
        fail_silently=False,
    )


def _issue_password_reset_code(target, user_type):
    code = _generate_verification_code()
    code_hash = _hash_verification_code(code)
    expires_at = timezone.now() + timedelta(minutes=PASSWORD_RESET_CODE_EXPIRY_MINUTES)

    if user_type == 'user':
        PasswordResetCode.objects.filter(user=target, is_used=False).update(is_used=True)
        PasswordResetCode.objects.create(
            user=target,
            code_hash=code_hash,
            expires_at=expires_at,
        )
    else:
        PasswordResetCode.objects.filter(brand=target, is_used=False).update(is_used=True)
        PasswordResetCode.objects.create(
            brand=target,
            code_hash=code_hash,
            expires_at=expires_at,
        )

    _send_password_reset_email(target.email, code)


def get_brand_from_request(request):
    """Get brand from authenticated request (works with CustomJWTAuthentication)"""
    if hasattr(request, 'user') and request.user and request.user.is_authenticated:
        if isinstance(request.user, BrandUser):
            return request.user.brand
        if hasattr(request.user, 'user_type') and request.user.user_type == 'brand':
            return request.user.brand
    return None


def get_brand_from_token(request):
    """Extract brand from JWT token"""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None
    
    token = auth_header.split(' ')[1]
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        decoded = AccessToken(token)
        brand_id = decoded.get('brand_id')
        if brand_id:
            return Brand.objects.get(id=brand_id)
    except Exception:
        pass
    return None


def get_user_from_token(request):
    """Extract customer user from JWT token"""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None

    token = auth_header.split(' ')[1]
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        decoded = AccessToken(token)
        user_id = decoded.get('user_id')
        if user_id:
            return User.objects.filter(id=user_id).first()
    except Exception:
        pass
    return None


def create_user_notification(user, title, body='', notification_type='system', related_order=None, related_product=None):
    if not user:
        return
    Notification.objects.create(
        recipient_user=user,
        title=title,
        body=body,
        notification_type=notification_type,
        related_order=related_order,
        related_product=related_product,
    )


def create_brand_notification(brand, title, body='', notification_type='system', related_order=None, related_product=None):
    if not brand:
        return
    Notification.objects.create(
        recipient_brand=brand,
        title=title,
        body=body,
        notification_type=notification_type,
        related_order=related_order,
        related_product=related_product,
    )


def resolve_notification_recipient(request):
    """Resolve either authenticated customer or brand from token"""
    if hasattr(request, 'user') and request.user and request.user.is_authenticated and not isinstance(request.user, BrandUser):
        return request.user, None

    brand = get_brand_from_token(request)
    if brand:
        return None, brand

    user = get_user_from_token(request)
    if user:
        return user, None

    return None, None


def get_tokens_for_user(user):
    """Generate JWT tokens for a user"""
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


def get_tokens_for_brand(brand):
    """Generate JWT tokens for a brand (manual token generation)"""
    from rest_framework_simplejwt.tokens import AccessToken
    from datetime import timedelta
    from django.conf import settings
    import uuid
    
    # Create tokens manually for brand
    refresh = RefreshToken()
    refresh['brand_id'] = brand.id
    refresh['brand_name'] = brand.brand_name
    refresh['user_type'] = 'brand'
    refresh['token_type'] = 'refresh'
    
    access = refresh.access_token
    access['brand_id'] = brand.id
    access['brand_name'] = brand.brand_name
    access['user_type'] = 'brand'
    
    return {
        'refresh': str(refresh),
        'access': str(access),
    }


class RegisterView(generics.CreateAPIView):
    """User registration endpoint"""
    queryset = User.objects.all()
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        _issue_verification_code(user, 'user')

        return Response({
            'message': 'Registration successful. Please verify your email before logging in.',
            'requires_verification': True,
            'email': user.email,
            'user_type': 'user',
        }, status=status.HTTP_201_CREATED)


class BrandRegisterView(generics.CreateAPIView):
    """Brand registration endpoint"""
    queryset = Brand.objects.all()
    permission_classes = [AllowAny]
    serializer_class = BrandRegisterSerializer
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        brand = serializer.save()

        _issue_verification_code(brand, 'brand')

        return Response({
            'message': 'Brand registration successful. Please verify your email before logging in.',
            'requires_verification': True,
            'email': brand.email,
            'user_type': 'brand',
        }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def send_verification_code_view(request):
    """Send initial email verification code"""
    serializer = VerificationSendSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)

    email = data['email']
    user_type = data['user_type']
    target = _get_verification_target(email, user_type)
    if not target:
        return Response({'detail': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)

    is_verified = _is_account_verified(target, user_type)
    if is_verified:
        return Response({'detail': 'Email already verified'}, status=status.HTTP_400_BAD_REQUEST)

    _issue_verification_code(target, user_type)
    return Response({'message': 'Verification code sent'})


@api_view(['POST'])
@permission_classes([AllowAny])
def resend_verification_code_view(request):
    """Resend email verification code with cooldown"""
    serializer = VerificationSendSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)

    email = data['email']
    user_type = data['user_type']
    target = _get_verification_target(email, user_type)
    if not target:
        return Response({'detail': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)

    is_verified = _is_account_verified(target, user_type)
    if is_verified:
        return Response({'detail': 'Email already verified'}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    if user_type == 'user':
        latest_code = EmailVerificationCode.objects.filter(user=target).order_by('-created_at').first()
    else:
        latest_code = EmailVerificationCode.objects.filter(brand=target).order_by('-created_at').first()

    if latest_code:
        elapsed_seconds = (now - latest_code.created_at).total_seconds()
        if elapsed_seconds < VERIFICATION_RESEND_COOLDOWN_SECONDS:
            return Response(
                {
                    'detail': 'Please wait before requesting another code.',
                    'retry_after': int(VERIFICATION_RESEND_COOLDOWN_SECONDS - elapsed_seconds),
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

    _issue_verification_code(target, user_type)
    return Response({'message': 'Verification code resent'})


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email_view(request):
    """Verify email using 6-digit code"""
    serializer = VerificationConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)

    email = data['email']
    user_type = data['user_type']
    code = data['code']

    target = _get_verification_target(email, user_type)
    if not target:
        return Response({'detail': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)

    if user_type == 'user':
        verification = EmailVerificationCode.objects.filter(user=target, is_used=False).order_by('-created_at').first()
    else:
        verification = EmailVerificationCode.objects.filter(brand=target, is_used=False).order_by('-created_at').first()

    if not verification:
        return Response({'detail': 'No active verification code found'}, status=status.HTTP_400_BAD_REQUEST)

    if verification.expires_at < timezone.now():
        verification.is_used = True
        verification.save(update_fields=['is_used', 'updated_at'])
        return Response({'detail': 'Verification code expired'}, status=status.HTTP_400_BAD_REQUEST)

    if verification.attempts >= VERIFICATION_MAX_ATTEMPTS:
        verification.is_used = True
        verification.save(update_fields=['is_used', 'updated_at'])
        return Response({'detail': 'Too many invalid attempts. Request a new code.'}, status=status.HTTP_400_BAD_REQUEST)

    if verification.code_hash != _hash_verification_code(code):
        verification.attempts += 1
        verification.save(update_fields=['attempts', 'updated_at'])
        return Response({'detail': 'Invalid verification code'}, status=status.HTTP_400_BAD_REQUEST)

    verification.is_used = True
    verification.save(update_fields=['is_used', 'updated_at'])

    marked_verified = _mark_account_verified(target, user_type)

    if marked_verified:
        _send_account_created_email(target.email)

    return Response({'message': 'Email verified successfully'})


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password_request_view(request):
    """Send password reset code to account email"""
    serializer = ForgotPasswordRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)

    email = data['email']
    target, user_type = _get_account_by_email(email)

    # Do not reveal whether account exists
    if not target:
        return Response({'message': 'If the account exists, a reset code has been sent.'})

    now = timezone.now()
    if user_type == 'user':
        latest_code = PasswordResetCode.objects.filter(user=target).order_by('-created_at').first()
    else:
        latest_code = PasswordResetCode.objects.filter(brand=target).order_by('-created_at').first()

    if latest_code:
        elapsed_seconds = (now - latest_code.created_at).total_seconds()
        if elapsed_seconds < PASSWORD_RESET_RESEND_COOLDOWN_SECONDS:
            return Response(
                {
                    'detail': 'Please wait before requesting another code.',
                    'retry_after': int(PASSWORD_RESET_RESEND_COOLDOWN_SECONDS - elapsed_seconds),
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

    _issue_password_reset_code(target, user_type)
    return Response({'message': 'If the account exists, a reset code has been sent.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password_confirm_view(request):
    """Confirm password reset code and set a new password"""
    serializer = ForgotPasswordConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)

    email = data['email']
    code = data['code']
    new_password = data['new_password']

    target, user_type = _get_account_by_email(email)
    if not target:
        return Response({'detail': 'Invalid reset request'}, status=status.HTTP_400_BAD_REQUEST)

    if user_type == 'user':
        reset_code = PasswordResetCode.objects.filter(user=target, is_used=False).order_by('-created_at').first()
    else:
        reset_code = PasswordResetCode.objects.filter(brand=target, is_used=False).order_by('-created_at').first()

    if not reset_code:
        return Response({'detail': 'No active reset code found'}, status=status.HTTP_400_BAD_REQUEST)

    if reset_code.expires_at < timezone.now():
        reset_code.is_used = True
        reset_code.save(update_fields=['is_used', 'updated_at'])
        return Response({'detail': 'Reset code expired'}, status=status.HTTP_400_BAD_REQUEST)

    if reset_code.attempts >= PASSWORD_RESET_MAX_ATTEMPTS:
        reset_code.is_used = True
        reset_code.save(update_fields=['is_used', 'updated_at'])
        return Response({'detail': 'Too many invalid attempts. Request a new code.'}, status=status.HTTP_400_BAD_REQUEST)

    if reset_code.code_hash != _hash_verification_code(code):
        reset_code.attempts += 1
        reset_code.save(update_fields=['attempts', 'updated_at'])
        return Response({'detail': 'Invalid reset code'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password, target)
    except ValidationError as exc:
        return Response({'detail': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    target.set_password(new_password)
    target.save(update_fields=['password'])

    reset_code.is_used = True
    reset_code.save(update_fields=['is_used', 'updated_at'])

    return Response({'message': 'Password reset successful. You can now log in.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """User/Brand login endpoint - checks both tables"""
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)
    
    username = data['username']
    password = data['password']
    
    # First, try to authenticate as a regular user
    user = authenticate(username=username, password=password)
    
    if user is not None:
        if not user.is_active:
            return Response(
                {'detail': 'User account is disabled'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not _is_user_email_verified(user):
            return Response(
                {
                    'detail': 'Email not verified. Please verify your email before logging in.',
                    'code': 'email_not_verified',
                    'email': user.email,
                    'user_type': 'user',
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        
        tokens = get_tokens_for_user(user)
        user_data = UserSerializer(user).data
        
        return Response({
            'user': user_data,
            'access': tokens['access'],
            'refresh': tokens['refresh'],
            'message': 'Login successful'
        })
    
    # If not a user, try to authenticate as a brand by username
    try:
        brand = Brand.objects.get(username=username)
        if brand.check_password(password):
            if not brand.is_active:
                return Response(
                    {'detail': 'Brand account is disabled'},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            if not brand.is_brand_verified:
                return Response(
                    {
                        'detail': 'Email not verified. Please verify your email before logging in.',
                        'code': 'email_not_verified',
                        'email': brand.email,
                        'user_type': 'brand',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            
            tokens = get_tokens_for_brand(brand)
            brand_data = BrandSerializer(brand).data
            
            return Response({
                'user': brand_data,
                'access': tokens['access'],
                'refresh': tokens['refresh'],
                'message': 'Login successful'
            })
    except Brand.DoesNotExist:
        pass
    
    # Also try brand login by email
    try:
        brand = Brand.objects.get(email=username)
        if brand.check_password(password):
            if not brand.is_active:
                return Response(
                    {'detail': 'Brand account is disabled'},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            if not brand.is_brand_verified:
                return Response(
                    {
                        'detail': 'Email not verified. Please verify your email before logging in.',
                        'code': 'email_not_verified',
                        'email': brand.email,
                        'user_type': 'brand',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            
            tokens = get_tokens_for_brand(brand)
            brand_data = BrandSerializer(brand).data
            
            return Response({
                'user': brand_data,
                'access': tokens['access'],
                'refresh': tokens['refresh'],
                'message': 'Login successful'
            })
    except Brand.DoesNotExist:
        pass
    
    # Neither user nor brand found
    return Response(
        {'detail': 'Invalid credentials'},
        status=status.HTTP_401_UNAUTHORIZED
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """User logout endpoint - blacklist the refresh token"""
    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
        return Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    """Get current user profile"""
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def update_profile_view(request):
    """Update current user profile"""
    serializer = UserSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ==================== Brand Profile Views ====================

@api_view(['GET'])
@permission_classes([AllowAny])
def brand_profile_view(request):
    """Get brand profile from token"""
    brand = get_brand_from_token(request)
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    serializer = BrandSerializer(brand)
    return Response(serializer.data)


@api_view(['PUT', 'PATCH'])
@permission_classes([AllowAny])
def update_brand_profile_view(request):
    """Update brand profile"""
    brand = get_brand_from_token(request)
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    serializer = BrandSerializer(brand, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ==================== Product CRUD Views ====================

@api_view(['GET'])
@permission_classes([AllowAny])
def product_list_view(request):
    """List all products (public) or brand's products"""
    # Try to get brand from request (CustomJWTAuthentication handles both user and brand tokens)
    brand = get_brand_from_request(request)
    
    if not brand:
        # Also try the manual token extraction as fallback
        brand = get_brand_from_token(request)
    
    if brand:
        # Return only this brand's products
        products = Product.objects.filter(brand=brand)
    else:
        # Return all active products for unauthenticated or regular users
        products = Product.objects.filter(is_active=True)
    
    serializer = ProductSerializer(products, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def product_create_view(request):
    """Create a new product with images (brand only)"""
    from django.db import transaction

    brand = get_brand_from_request(request)
    if not brand:
        brand = get_brand_from_token(request)
    
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Validate images count BEFORE creating the product
    images_data = request.data.get('images', [])
    if len(images_data) > 4:
        return Response({'detail': 'Maximum 4 images allowed'}, status=status.HTTP_400_BAD_REQUEST)

    serializer = ProductCreateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    with transaction.atomic():
        product = serializer.save(brand=brand)
        
        for index, img in enumerate(images_data):
            if isinstance(img, dict) and 'data' in img:
                image_data = img['data']
                if ',' in image_data:
                    image_data = image_data.split(',')[1]
                
                image_type = img.get('type', 'image/jpeg')
                ProductImage.objects.create(
                    product=product,
                    image_data=image_data,
                    image_type=image_type,
                    order=index
                )
    
    return Response(ProductSerializer(product, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([AllowAny])
def product_detail_view(request, product_id):
    """Get product details"""
    try:
        product = Product.objects.get(id=product_id)
        serializer = ProductSerializer(product, context={'request': request})
        return Response(serializer.data)
    except Product.DoesNotExist:
        return Response({'detail': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)



@api_view(['PUT', 'PATCH'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def product_update_view(request, product_id):
    """Update a product with images (brand owner only)"""
    brand = get_brand_from_request(request)
    if not brand:
        brand = get_brand_from_token(request)
    
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        product = Product.objects.get(id=product_id, brand=brand)
    except Product.DoesNotExist:
        return Response({'detail': 'Product not found or not owned by you'}, status=status.HTTP_404_NOT_FOUND)
    
    serializer = ProductCreateUpdateSerializer(product, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    
    # Handle base64 images if provided (max 4)
    images_data = request.data.get('images', [])
    if images_data:
        # Check total count (existing + new)
        existing_count = ProductImage.objects.filter(product=product).count()
        if existing_count + len(images_data) > 4:
            return Response({'detail': f'Maximum 4 images allowed. You have {existing_count} images.'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        for index, img in enumerate(images_data):
            if isinstance(img, dict) and 'data' in img:
                # Remove data URI prefix if present
                image_data = img['data']
                if ',' in image_data:
                    image_data = image_data.split(',')[1]
                
                image_type = img.get('type', 'image/jpeg')
                ProductImage.objects.create(
                    product=product,
                    image_data=image_data,
                    image_type=image_type,
                    order=existing_count + index
                )
    
    return Response(ProductSerializer(product, context={'request': request}).data)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def product_delete_view(request, product_id):
    """Delete a product (brand owner only)"""
    brand = get_brand_from_request(request)
    if not brand:
        brand = get_brand_from_token(request)
    
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        product = Product.objects.get(id=product_id, brand=brand)
    except Product.DoesNotExist:
        return Response({'detail': 'Product not found or not owned by you'}, status=status.HTTP_404_NOT_FOUND)
    
    product.delete()
    return Response({'message': 'Product deleted successfully'}, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def product_image_delete_view(request, image_id):
    """Delete a product image (brand owner only)"""
    brand = get_brand_from_request(request)
    if not brand:
        brand = get_brand_from_token(request)
    
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        image = ProductImage.objects.get(id=image_id, product__brand=brand)
        image.delete()
        return Response({'message': 'Image deleted successfully'}, status=status.HTTP_200_OK)
    except ProductImage.DoesNotExist:
        return Response({'detail': 'Image not found or not owned by you'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([AllowAny])
def brand_products_view(request, brand_id):
    """Get all products from a specific brand (public)"""
    try:
        brand = Brand.objects.get(id=brand_id)
        products = Product.objects.filter(brand=brand, is_active=True)
        serializer = ProductSerializer(products, many=True, context={'request': request})
        return Response({
            'brand': BrandSerializer(brand).data,
            'products': serializer.data
        })
    except Brand.DoesNotExist:
        return Response({'detail': 'Brand not found'}, status=status.HTTP_404_NOT_FOUND)


# ==================== WISHLIST VIEWS ====================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def wishlist_list_view(request):
    """Get user's wishlist"""
    wishlist_items = Wishlist.objects.filter(user=request.user)
    serializer = WishlistSerializer(wishlist_items, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def wishlist_add_view(request):
    """Add product to wishlist"""
    product_id = request.data.get('product_id')
    if not product_id:
        return Response({'detail': 'product_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        product = Product.objects.get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return Response({'detail': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
    
    wishlist_item, created = Wishlist.objects.get_or_create(user=request.user, product=product)
    
    if created:
        serializer = WishlistSerializer(wishlist_item)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    else:
        return Response({'detail': 'Product already in wishlist'}, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def wishlist_remove_view(request, product_id):
    """Remove product from wishlist"""
    try:
        wishlist_item = Wishlist.objects.get(user=request.user, product_id=product_id)
        wishlist_item.delete()
        return Response({'message': 'Removed from wishlist'}, status=status.HTTP_200_OK)
    except Wishlist.DoesNotExist:
        return Response({'detail': 'Product not in wishlist'}, status=status.HTTP_404_NOT_FOUND)


# ==================== CART VIEWS ====================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cart_list_view(request):
    """Get user's cart"""
    cart_items = CartItem.objects.filter(user=request.user)
    serializer = CartItemSerializer(cart_items, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cart_add_view(request):
    """Add product to cart"""
    product_id = request.data.get('product_id')
    quantity = request.data.get('quantity', 1)
    selected_size = request.data.get('selected_size', '')
    selected_color = request.data.get('selected_color', '')
    
    if not product_id:
        return Response({'detail': 'product_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        product = Product.objects.get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return Response({'detail': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Check if item with same size/color already in cart
    cart_item, created = CartItem.objects.get_or_create(
        user=request.user, 
        product=product,
        selected_size=selected_size,
        selected_color=selected_color,
        defaults={'quantity': quantity}
    )
    
    if not created:
        # Update quantity if already exists
        cart_item.quantity += quantity
        cart_item.save()
    
    serializer = CartItemSerializer(cart_item)
    return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def cart_update_view(request, item_id):
    """Update cart item quantity"""
    quantity = request.data.get('quantity')
    
    if quantity is None:
        return Response({'detail': 'quantity is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        cart_item = CartItem.objects.get(id=item_id, user=request.user)
        
        if quantity <= 0:
            cart_item.delete()
            return Response({'message': 'Item removed from cart'}, status=status.HTTP_200_OK)
        
        cart_item.quantity = quantity
        cart_item.save()
        serializer = CartItemSerializer(cart_item)
        return Response(serializer.data)
    except CartItem.DoesNotExist:
        return Response({'detail': 'Cart item not found'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def cart_remove_view(request, item_id):
    """Remove item from cart"""
    try:
        cart_item = CartItem.objects.get(id=item_id, user=request.user)
        cart_item.delete()
        return Response({'message': 'Removed from cart'}, status=status.HTTP_200_OK)
    except CartItem.DoesNotExist:
        return Response({'detail': 'Cart item not found'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def cart_clear_view(request):
    """Clear entire cart"""
    CartItem.objects.filter(user=request.user).delete()
    return Response({'message': 'Cart cleared'}, status=status.HTTP_200_OK)


# ============ REVIEW ENDPOINTS ============

@api_view(['GET'])
@permission_classes([AllowAny])
def product_reviews_view(request, product_id):
    """Get all reviews for a product with average rating"""
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return Response({'detail': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # All ratings (for average calculation)
    all_ratings = Review.objects.filter(product=product)
    
    # Only reviews with comments (for display)
    reviews_with_comments = Review.objects.filter(product=product).exclude(comment__isnull=True).exclude(comment='')
    serializer = ReviewSerializer(reviews_with_comments, many=True)
    
    # Calculate average rating from ALL ratings
    total_ratings = all_ratings.count()
    if total_ratings > 0:
        from django.db.models import Avg
        avg_rating = all_ratings.aggregate(Avg('rating'))['rating__avg']
    else:
        avg_rating = 0
    
    # Count only reviews with comments
    total_reviews = reviews_with_comments.count()
    
    # Get user's own rating if authenticated and user is a real customer
    user_rating = None
    from django.contrib.auth import get_user_model
    CustomUser = get_user_model()
    if request.user and request.user.is_authenticated and isinstance(request.user, CustomUser):
        user_review = Review.objects.filter(product=product, user=request.user).first()
        if user_review:
            user_rating = user_review.rating
    
    return Response({
        'reviews': serializer.data,
        'average_rating': round(avg_rating, 1) if avg_rating else 0,
        'total_reviews': total_reviews,
        'total_ratings': total_ratings,
        'user_rating': user_rating
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def review_create_view(request):
    """Create or update a review for a product"""
    product_id = request.data.get('product_id')
    
    if not product_id:
        return Response({'detail': 'product_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        product = Product.objects.get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return Response({'detail': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Check if user already reviewed this product
    existing_review = Review.objects.filter(user=request.user, product=product).first()
    
    if existing_review:
        # Update existing review - preserve comment if not provided or empty
        new_rating = request.data.get('rating', existing_review.rating)
        new_comment = request.data.get('comment')
        new_title = request.data.get('title')
        
        # Only update fields that are explicitly provided with non-empty values
        existing_review.rating = new_rating
        if new_comment is not None and new_comment != '':
            existing_review.comment = new_comment
        if new_title is not None and new_title != '':
            existing_review.title = new_title
        
        existing_review.save()
        return Response(ReviewSerializer(existing_review).data, status=status.HTTP_200_OK)
    else:
        # Create new review
        serializer = ReviewCreateSerializer(data=request.data)
        if serializer.is_valid():
            data = _validated_data(serializer)
            review = Review.objects.create(
                user=request.user,
                product=product,
                rating=data.get('rating', 5),
                title=data.get('title', ''),
                comment=data.get('comment', '')
            )
            return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def review_delete_view(request, review_id):
    """Delete user's own review"""
    try:
        review = Review.objects.get(id=review_id, user=request.user)
        review.delete()
        return Response({'message': 'Review deleted'}, status=status.HTTP_200_OK)
    except Review.DoesNotExist:
        return Response({'detail': 'Review not found'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_reviews_view(request):
    """Get all reviews by current user"""
    reviews = Review.objects.filter(user=request.user)
    serializer = ReviewSerializer(reviews, many=True)
    return Response(serializer.data)


# ============ MESSAGE ENDPOINTS ============

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def product_messages_view(request, product_id):
    """Get all messages for a product between the current user/brand and the other party"""
    from django.db.models import Q
    from .models import CustomUser

    product = Product.objects.filter(id=product_id).first()
    if not product:
        return Response({'detail': 'Product not found'}, status=404)

    user = request.user
    is_brand = isinstance(user, BrandUser)
    brand = user.brand if is_brand else None

    # Optional: filter by explicit chat partner username
    chat_with = request.query_params.get('chat_with')
    
    if is_brand:
        if chat_with:
            other_user = CustomUser.objects.filter(username=chat_with).first()
            if not other_user:
                return Response({'detail': 'User not found'}, status=404)

            messages = Message.objects.filter(
                Q(product=product) & (
                    (Q(sender_brand=brand) & Q(receiver_user=other_user)) |
                    (Q(sender_user=other_user) & Q(receiver_brand=brand))
                )
            ).order_by('timestamp')
        else:
            messages = Message.objects.filter(
                Q(product=product) & (Q(sender_brand=brand) | Q(receiver_brand=brand))
            ).order_by('timestamp')

        Message.objects.filter(
            id__in=messages.values_list('id', flat=True),
            receiver_brand=brand,
            is_read=False,
        ).update(is_read=True)
    elif chat_with:
        # User requesting explicit conversation: either with product brand or with another user
        if chat_with == product.brand.username:
            messages = Message.objects.filter(
                Q(product=product) & (
                    (Q(sender_user=user) & Q(receiver_brand=product.brand)) |
                    (Q(sender_brand=product.brand) & Q(receiver_user=user))
                )
            ).order_by('timestamp')
        else:
            other_user = CustomUser.objects.filter(username=chat_with).first()
            if not other_user:
                return Response({'detail': 'User not found'}, status=404)
            messages = Message.objects.filter(
                Q(product=product) & (
                    (Q(sender_user=user) & Q(receiver_user=other_user)) |
                    (Q(sender_user=other_user) & Q(receiver_user=user))
                )
            ).order_by('timestamp')

        Message.objects.filter(
            id__in=messages.values_list('id', flat=True),
            receiver_user=user,
            is_read=False,
        ).update(is_read=True)
    else:
        # Default customer view is only their brand conversation for this product
        messages = Message.objects.filter(
            Q(product=product) & (
                (Q(sender_user=user) & Q(receiver_brand=product.brand)) |
                (Q(sender_brand=product.brand) & Q(receiver_user=user))
            )
        ).order_by('timestamp')
        Message.objects.filter(
            id__in=messages.values_list('id', flat=True),
            receiver_user=user,
            is_read=False,
        ).update(is_read=True)

    serializer = MessageSerializer(messages, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_message_view(request):
    """Send a message for a product chat (customer-to-brand or user-to-user)"""
    from django.db.models import Q

    data = request.data
    product_id = data.get('product') or data.get('product_id')
    message_text = data.get('message')
    receiver_username = data.get('receiver_username')  # For user-to-user chat
    if not product_id or not message_text:
        return Response({'detail': 'product and message are required'}, status=400)
    try:
        product_id = int(product_id)
    except (ValueError, TypeError):
        return Response({'detail': 'Invalid product id'}, status=400)
    product = Product.objects.filter(id=product_id).first()
    if not product:
        return Response({'detail': 'Product not found'}, status=404)

    from .models import CustomUser

    receiver_user = None
    if receiver_username:
        receiver_user = CustomUser.objects.filter(username=receiver_username).first()
        if not receiver_user:
            return Response({'detail': 'Receiver not found'}, status=404)

    user = request.user
    is_brand = isinstance(user, BrandUser)
    msg = Message(product=product, message=message_text)

    if is_brand:
        _set_message_sender_brand(msg, user.brand)

        if receiver_user:
            _set_message_receiver_user(msg, receiver_user)
        else:
            # Fallback for older clients: infer target user only when exactly one participant exists.
            participant_ids = set()
            for sender_id, receiver_id in Message.objects.filter(
                product=product
            ).filter(
                Q(sender_brand=user.brand) | Q(receiver_brand=user.brand)
            ).values_list('sender_user_id', 'receiver_user_id'):
                if sender_id:
                    participant_ids.add(sender_id)
                if receiver_id:
                    participant_ids.add(receiver_id)

            if len(participant_ids) == 1:
                inferred_receiver = CustomUser.objects.filter(id=next(iter(participant_ids))).first()
                _set_message_receiver_user(msg, inferred_receiver)
            else:
                return Response(
                    {'detail': 'receiver_username is required for brand messages in multi-user product chats'},
                    status=400,
                )

        msg.is_from_brand = True
    elif receiver_user:
        # User-to-user message
        msg.sender_user = user
        _set_message_receiver_user(msg, receiver_user)
        msg.is_from_brand = False
    else:
        msg.sender_user = user
        _set_message_receiver_brand(msg, product.brand)
        msg.is_from_brand = False

    msg.save()
    return Response(MessageSerializer(msg).data, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def conversations_list_view(request):
    """Get all conversations for the current user/brand, grouped by product + chat partner."""
    from django.db.models import Q
    from collections import OrderedDict

    user = request.user
    is_brand = isinstance(user, BrandUser)
    brand = user.brand if is_brand else None

    if is_brand:
        brand = user.brand
        msgs = Message.objects.filter(
            Q(sender_brand=brand) | Q(receiver_brand=brand)
        ).select_related('product', 'product__brand', 'sender_user', 'sender_brand', 'receiver_user', 'receiver_brand'
        ).order_by('-timestamp')
    else:
        msgs = Message.objects.filter(
            Q(sender_user=user) | Q(receiver_user=user)
        ).select_related('product', 'product__brand', 'sender_user', 'sender_brand', 'receiver_user', 'receiver_brand'
        ).order_by('-timestamp')

    # Group by product + chat partner (to separate brand chats from user-to-user chats)
    unread_counts = {}

    def get_conversation_meta(msg_item):
        pid_local = msg_item.product_id
        product_local = msg_item.product

        if is_brand:
            other_name_local = None
            if msg_item.sender_user:
                other_name_local = msg_item.sender_user.username
            elif msg_item.receiver_user:
                other_name_local = msg_item.receiver_user.username
            if not other_name_local:
                other_name_local = 'Customer'
            chat_type_local = 'brand'
            convo_key_local = f"{pid_local}_brand_{other_name_local}"
        else:
            is_user_to_user_local = (
                msg_item.sender_brand is None and msg_item.receiver_brand is None and
                msg_item.sender_user is not None and msg_item.receiver_user is not None
            )
            if is_user_to_user_local:
                if msg_item.sender_user_id == user.id:
                    other_name_local = msg_item.receiver_user.username
                else:
                    other_name_local = msg_item.sender_user.username
                chat_type_local = 'user'
                convo_key_local = f"{pid_local}_user_{other_name_local}"
            else:
                other_name_local = product_local.brand.username if product_local.brand else 'Brand'
                chat_type_local = 'brand'
                convo_key_local = f"{pid_local}_brand"

        return convo_key_local, chat_type_local, other_name_local

    for msg in msgs:
        convo_key, _, _ = get_conversation_meta(msg)
        is_unread_for_current_user = False
        if is_brand:
            receiver_brand_id = _model_int_id(msg, 'receiver_brand_id')
            is_unread_for_current_user = bool(brand and receiver_brand_id == brand.id and not msg.is_read)
        else:
            receiver_user_id = _model_int_id(msg, 'receiver_user_id')
            is_unread_for_current_user = bool(receiver_user_id == user.id and not msg.is_read)

        if is_unread_for_current_user:
            unread_counts[convo_key] = unread_counts.get(convo_key, 0) + 1

    seen_convos = OrderedDict()
    for msg in msgs:
        pid = _model_int_id(msg, 'product_id')
        product = msg.product
        convo_key, chat_type, other_name = get_conversation_meta(msg)

        if is_brand:
            sender_brand_id = _model_int_id(msg, 'sender_brand_id')
            is_last_from_me = bool(brand and sender_brand_id == brand.id)
        else:
            sender_user_id = _model_int_id(msg, 'sender_user_id')
            is_last_from_me = bool(sender_user_id == user.id)

        if convo_key not in seen_convos:
            # Get product image
            product_image = None
            try:
                first_img = ProductImage.objects.filter(product=product).order_by('order', 'created_at').first()
                if first_img and first_img.image_data:
                    product_image = f"data:{first_img.image_type};base64,{first_img.image_data}"
            except Exception:
                pass

            last_sender_name = None
            if msg.sender_brand:
                last_sender_name = msg.sender_brand.username
            elif msg.sender_user:
                last_sender_name = msg.sender_user.username

            seen_convos[convo_key] = {
                'product_id': pid,
                'product_name': product.name,
                'product_image': product_image,
                'brand_name': product.brand.username if product.brand else 'Unknown',
                'other_party_name': other_name,
                'last_message': msg.message,
                'last_message_time': msg.timestamp.isoformat(),
                'is_last_from_brand': msg.is_from_brand,
                'is_last_from_me': is_last_from_me,
                'last_sender_name': last_sender_name,
                'unread_count': unread_counts.get(convo_key, 0),
                'chat_type': chat_type,  # 'brand' or 'user'
            }

    conversations = list(seen_convos.values())
    return Response(conversations)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_message_to_brand_view(request):
    """Send a message to a brand (initiates or continues a product chat).
    Used from review profile clicks where we know the brand username."""
    data = request.data
    brand_username = data.get('brand_username')
    product_id = data.get('product_id')
    message_text = data.get('message')

    if not brand_username or not message_text:
        return Response({'detail': 'brand_username and message are required'}, status=400)

    brand = Brand.objects.filter(username=brand_username).first()
    if not brand:
        return Response({'detail': 'Brand not found'}, status=404)

    user = request.user
    is_brand = isinstance(user, BrandUser)

    # If product_id provided, use that product; otherwise find or use the first product by brand
    if product_id:
        product = Product.objects.filter(id=product_id).first()
        if not product:
            return Response({'detail': 'Product not found'}, status=404)
    else:
        product = Product.objects.filter(brand=brand).first()
        if not product:
            return Response({'detail': 'No products found for this brand'}, status=404)

    msg = Message(
        product=product,
        message=message_text,
        is_from_brand=is_brand,
    )
    if is_brand:
        _set_message_sender_brand(msg, brand)
    else:
        msg.sender_user = user
        _set_message_receiver_brand(msg, brand)
    msg.save()

    if not is_brand:
        create_brand_notification(
            brand,
            title=f'New message from {user.username}',
            body=message_text[:180],
            notification_type='message',
            related_product=product,
        )

    return Response(MessageSerializer(msg).data, status=201)


@api_view(['GET'])
@permission_classes([AllowAny])
def notifications_list_view(request):
    """List notifications for current customer/brand"""
    user, brand = resolve_notification_recipient(request)
    if not user and not brand:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    qs = Notification.objects.filter(recipient_user=user) if user else Notification.objects.filter(recipient_brand=brand)
    return Response(NotificationSerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def notifications_unread_count_view(request):
    """Get unread notifications count for current customer/brand"""
    user, brand = resolve_notification_recipient(request)
    if not user and not brand:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    qs = Notification.objects.filter(recipient_user=user) if user else Notification.objects.filter(recipient_brand=brand)
    return Response({'unread_count': qs.filter(is_read=False).count()})


@api_view(['POST'])
@permission_classes([AllowAny])
def notification_mark_read_view(request, notification_id):
    """Mark a single notification as read"""
    user, brand = resolve_notification_recipient(request)
    if not user and not brand:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        notification = Notification.objects.get(id=notification_id, recipient_user=user) if user else Notification.objects.get(id=notification_id, recipient_brand=brand)
    except Notification.DoesNotExist:
        return Response({'detail': 'Notification not found'}, status=status.HTTP_404_NOT_FOUND)

    notification.is_read = True
    notification.save(update_fields=['is_read'])
    return Response(NotificationSerializer(notification).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def notifications_mark_all_read_view(request):
    """Mark all notifications as read"""
    user, brand = resolve_notification_recipient(request)
    if not user and not brand:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    qs = Notification.objects.filter(recipient_user=user) if user else Notification.objects.filter(recipient_brand=brand)
    updated = qs.filter(is_read=False).update(is_read=True)
    return Response({'updated': updated})


from django.http import HttpResponse
from django.http.response import HttpResponseRedirectBase


class AppRedirect(HttpResponseRedirectBase):
    # Allow deep-link redirects back to the mobile app.
    allowed_schemes = HttpResponseRedirectBase.allowed_schemes + ['shopflare']

# ==================== Address Views ====================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def address_list_view(request):
    """List all addresses of current user"""
    addresses = Address.objects.filter(user=request.user)
    serializer = AddressSerializer(addresses, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def address_create_view(request):
    """Create a new address for current user"""
    serializer = AddressSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(user=request.user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def address_detail_view(request, address_id):
    """Retrieve, update or delete a specific address"""
    try:
        address = Address.objects.get(id=address_id, user=request.user)
    except Address.DoesNotExist:
        return Response({'detail': 'Address not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(AddressSerializer(address).data)

    if request.method in ('PUT', 'PATCH'):
        partial = request.method == 'PATCH'
        serializer = AddressSerializer(address, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    if request.method == 'DELETE':
        address.delete()
        return Response({'message': 'Address deleted'}, status=status.HTTP_200_OK)


# ==================== Change Password Views ====================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """Change password for authenticated customer"""
    serializer = ChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)

    user = request.user
    if not user.check_password(data['old_password']):
        return Response({'detail': 'Old password is incorrect'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(data['new_password'])
    user.save()
    return Response({'message': 'Password changed successfully'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def change_brand_password_view(request):
    """Change password for authenticated brand"""
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError as DjangoValidationError

    brand = get_brand_from_token(request)
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    old_password = request.data.get('old_password')
    new_password = request.data.get('new_password')
    new_password2 = request.data.get('new_password2')

    if not old_password or not new_password or not new_password2:
        return Response({'detail': 'old_password, new_password and new_password2 are required'},
                        status=status.HTTP_400_BAD_REQUEST)

    if not brand.check_password(old_password):
        return Response({'detail': 'Old password is incorrect'}, status=status.HTTP_400_BAD_REQUEST)

    if new_password != new_password2:
        return Response({'detail': "Passwords didn't match"}, status=status.HTTP_400_BAD_REQUEST)

    # Validate password strength
    try:
        validate_password(new_password)
    except DjangoValidationError as e:
        return Response({'detail': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

    brand.set_password(new_password)
    brand.save()
    return Response({'message': 'Password changed successfully'}, status=status.HTTP_200_OK)


# ==================== Brand Analytics View ====================

@api_view(['GET'])
@permission_classes([AllowAny])
def brand_analytics_view(request):
    """Get analytics data for a brand"""
    brand = get_brand_from_token(request)
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    from django.db.models import Sum, Avg, Count

    products = Product.objects.filter(brand=brand)
    total_products = products.count()
    active_products = products.filter(is_active=True).count()

    # Wishlist count (products from this brand saved by users)
    wishlist_count = Wishlist.objects.filter(product__brand=brand).count()

    # Cart count (products from this brand in user carts)
    cart_count = CartItem.objects.filter(product__brand=brand).aggregate(
        total=Sum('quantity'))['total'] or 0

    # Reviews
    review_stats = Review.objects.filter(product__brand=brand).aggregate(
        total=Count('id'), avg_rating=Avg('rating'))
    total_reviews = review_stats['total'] or 0
    avg_rating = round(review_stats['avg_rating'] or 0, 1)

    # Sales and order metrics (count only delivered orders as completed sales)
    sold_items = OrderItem.objects.filter(brand=brand, order__status='delivered')
    sales_stats = sold_items.aggregate(
        total_sales=Sum('line_total'),
        units_sold=Sum('quantity'),
        total_orders=Count('order', distinct=True),
    )
    total_sales = sales_stats['total_sales'] or 0
    units_sold = int(sales_stats['units_sold'] or 0)
    total_orders = int(sales_stats['total_orders'] or 0)
    avg_order_value = round((float(total_sales) / total_orders), 2) if total_orders else 0

    top_selling_products = (
        sold_items.values('product_id', 'product_name')
        .annotate(units_sold=Sum('quantity'), revenue=Sum('line_total'))
        .order_by('-units_sold')[:5]
    )
    top_selling_products_data = [
        {
            'id': p['product_id'],
            'name': p['product_name'],
            'units_sold': int(p['units_sold'] or 0),
            'revenue': str(p['revenue'] or 0),
        }
        for p in top_selling_products
    ]

    # Top 5 products by wishlist saves
    top_products = (
        products.filter(is_active=True)
        .annotate(saves=Count('wishlisted_by'))
        .order_by('-saves')[:5]
    )
    top_products_data = [
        {
            'id': p['id'],
            'name': p['name'],
            'price': str(p['price']),
            'saves': int(p.get('saves') or 0),
        }
        for p in top_products.values('id', 'name', 'price', 'saves')
    ]

    return Response({
        'total_products': total_products,
        'active_products': active_products,
        'wishlist_saves': wishlist_count,
        'cart_adds': int(cart_count),
        'total_reviews': total_reviews,
        'average_rating': avg_rating,
        'top_products': top_products_data,
        'total_sales': round(float(total_sales), 2),
        'total_orders': total_orders,
        'units_sold': units_sold,
        'avg_order_value': avg_order_value,
        'top_selling_products': top_selling_products_data,
    })


def health(request):
    return HttpResponse("OK")


def _generate_transaction_id(order_id):
    return f"SF-{order_id}-{secrets.token_hex(4).upper()}"


def _get_public_base_url(request):
    if settings.DEBUG:
        scheme = 'http'
    else:
        scheme = 'https'
    host = request.get_host()
    return f"{scheme}://{host}"


def _resolve_payment_callback_url(request, path, configured_url=''):
    if configured_url:
        return configured_url
    return f"{_get_public_base_url(request)}{path}"


def _build_app_redirect_url(base_url, order_id=None, payment_status=None, transaction_id='', guest_token=''):
    if not base_url:
        return ''

    parsed = urllib_parse.urlparse(base_url)
    query_params = dict(urllib_parse.parse_qsl(parsed.query, keep_blank_values=True))
    if order_id is not None:
        query_params['id'] = str(order_id)
    if payment_status:
        query_params['payment_status'] = str(payment_status)
    if transaction_id:
        query_params['tran_id'] = str(transaction_id)
    if guest_token:
        query_params['guestToken'] = str(guest_token)

    new_query = urllib_parse.urlencode(query_params)
    return urllib_parse.urlunparse(parsed._replace(query=new_query))


def _should_redirect_to_app(request):
    if request.query_params.get('no_redirect') == '1':
        return False

    if request.method == 'GET':
        return True

    accept_header = request.META.get('HTTP_ACCEPT', '')
    return 'text/html' in accept_header.lower()


def _app_redirect_response(redirect_url, title='Returning to ShopFlare'):
        if not redirect_url:
                return Response({'detail': 'Redirect URL is missing'}, status=status.HTTP_400_BAD_REQUEST)

        # Use an HTML handoff page because some payment/browser flows block direct custom-scheme redirects.
        safe_url_json = json.dumps(redirect_url)
        html = f"""
<!doctype html>
<html>
    <head>
        <meta charset=\"utf-8\" />
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
        <title>{title}</title>
        <style>
            body {{ font-family: Arial, sans-serif; background:#f8fafc; color:#111827; margin:0; }}
            .wrap {{ max-width: 520px; margin: 64px auto; padding: 24px; background:#fff; border-radius:14px; box-shadow: 0 8px 24px rgba(0,0,0,.08); text-align:center; }}
            h1 {{ font-size: 20px; margin: 0 0 12px; }}
            p {{ color:#4b5563; margin: 0 0 18px; }}
            a {{ display:inline-block; padding:10px 16px; border-radius:10px; background:#111827; color:#fff; text-decoration:none; font-weight:600; }}
        </style>
    </head>
    <body>
        <div class=\"wrap\">
            <h1>{title}</h1>
            <p>If the app does not open automatically, tap the button below.</p>
            <a id=\"open-app\" href={safe_url_json}>Open ShopFlare App</a>
        </div>
        <script>
            const deepLink = {safe_url_json};
            window.location.href = deepLink;
            setTimeout(() => {{ window.location.replace(deepLink); }}, 500);
            setTimeout(() => {{
                const btn = document.getElementById('open-app');
                if (btn) btn.focus();
            }}, 1200);
        </script>
    </body>
</html>
"""
        return HttpResponse(html)


def _post_form(url, payload):
    encoded_payload = urllib_parse.urlencode(payload).encode('utf-8')
    req = urllib_request.Request(url, data=encoded_payload)
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urllib_request.urlopen(req, timeout=25) as response:
        body = response.read().decode('utf-8')
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {'raw_response': body}


def _validate_ssl_payment(val_id, transaction_id):
    if not settings.SSL_PAYMENT_VERIFY_ENABLED:
        return {'status': 'VALID', 'tran_id': transaction_id}

    validate_payload = {
        'val_id': val_id,
        'store_id': settings.SSL_STORE_ID,
        'store_passwd': settings.SSL_STORE_PASSWORD,
        'format': 'json',
    }
    return _post_form(settings.SSL_VALIDATE_URL, validate_payload)


def _initialize_ssl_payment(request, order, payment):
    if not settings.SSL_STORE_ID or not settings.SSL_STORE_PASSWORD:
        return {'ok': False, 'error': 'SSLCommerz credentials are not configured.'}

    success_url = _resolve_payment_callback_url(
        request,
        '/api/auth/payment/ssl/success/',
        settings.SSL_SUCCESS_URL,
    )
    fail_url = _resolve_payment_callback_url(
        request,
        '/api/auth/payment/ssl/fail/',
        settings.SSL_FAIL_URL,
    )
    cancel_url = _resolve_payment_callback_url(
        request,
        '/api/auth/payment/ssl/cancel/',
        settings.SSL_CANCEL_URL,
    )
    ipn_url = _resolve_payment_callback_url(
        request,
        '/api/auth/payment/ssl/ipn/',
        settings.SSL_IPN_URL,
    )

    payload = {
        'store_id': settings.SSL_STORE_ID,
        'store_passwd': settings.SSL_STORE_PASSWORD,
        'total_amount': str(order.total_amount),
        'currency': 'BDT',
        'tran_id': payment.transaction_id,
        'success_url': success_url,
        'fail_url': fail_url,
        'cancel_url': cancel_url,
        'ipn_url': ipn_url,
        'shipping_method': 'NO',
        'product_name': f'ShopFlare Order #{order.id}',
        'product_category': 'Fashion',
        'product_profile': 'general',
        'cus_name': order.shipping_full_name or 'Customer',
        'cus_email': order.guest_email or (order.user.email if order.user else 'customer@shopflare.com'),
        'cus_add1': order.shipping_address_line1,
        'cus_add2': order.shipping_address_line2 or '',
        'cus_city': order.shipping_city,
        'cus_state': order.shipping_state or '',
        'cus_postcode': order.shipping_postal_code or '',
        'cus_country': order.shipping_country or 'Bangladesh',
        'cus_phone': order.shipping_phone or '',
        'ship_name': order.shipping_full_name or 'Customer',
        'ship_add1': order.shipping_address_line1,
        'ship_add2': order.shipping_address_line2 or '',
        'ship_city': order.shipping_city,
        'ship_state': order.shipping_state or '',
        'ship_postcode': order.shipping_postal_code or '',
        'ship_country': order.shipping_country or 'Bangladesh',
    }

    try:
        response_data = _post_form(settings.SSL_INIT_URL, payload)
    except urllib_error.URLError as exc:
        return {'ok': False, 'error': f'Failed to connect to SSLCommerz: {exc}'}
    except Exception as exc:
        return {'ok': False, 'error': f'Payment initialization failed: {exc}'}

    payment_url = response_data.get('GatewayPageURL')
    if not payment_url:
        # Surface the REAL reason from SSLCommerz instead of a generic message.
        failed_reason = response_data.get('failedreason') or response_data.get('status') or 'unknown'
        # Fall back to a local mock payment so checkout can still complete in dev/staging.
        if settings.MOCK_PAYMENT_ENABLED:
            mock_url = f"{settings.MOCK_PAYMENT_BASE_URL}/api/auth/payment/mock/success/?tran_id={payment.transaction_id}"
            payment.payment_url = mock_url
            payment.gateway_raw_response = json.dumps({'mock': True, 'ssl_failedreason': failed_reason})
            payment.status = 'mock_redirect'
            payment.save(update_fields=['payment_url', 'gateway_raw_response', 'status', 'updated_at'])
            return {
                'ok': True,
                'payment_url': mock_url,
                'is_mock': True,
                'gateway_note': f"SSLCommerz unavailable ({failed_reason}); using local mock payment.",
                'data': response_data,
            }
        return {'ok': False, 'error': f'SSLCommerz did not return payment URL: {failed_reason}', 'data': response_data}

    payment.payment_url = payment_url
    payment.gateway_raw_response = json.dumps(response_data)
    payment.save(update_fields=['payment_url', 'gateway_raw_response', 'updated_at'])
    return {'ok': True, 'payment_url': payment_url, 'data': response_data}


def _complete_paid_order(payment, gateway_val_id='', gateway_payload=None):
    from django.db import transaction

    order = payment.order
    if order.payment_status == 'paid':
        if _model_int_id(order, 'user_id') is not None:
            CartItem.objects.filter(user=order.user).delete()
        return {'ok': True, 'already_paid': True}

    with transaction.atomic():
        locked_payment = SSLPayment.objects.select_for_update().select_related('order').get(id=payment.id)
        locked_order = locked_payment.order
        if locked_order.payment_status == 'paid' or locked_payment.status == 'paid':
            if _model_int_id(locked_order, 'user_id') is not None:
                CartItem.objects.filter(user=locked_order.user).delete()
            return {'ok': True, 'already_paid': True}

        items = list(OrderItem.objects.filter(order=locked_order).select_related('product', 'brand'))
        product_ids = [pid for item in items if (pid := _model_int_id(item, 'product_id')) is not None]
        locked_products = list(Product.objects.select_for_update().filter(id__in=product_ids))
        product_map = {pid: p for p in locked_products if (pid := _model_int_id(p, 'id')) is not None}

        for item in items:
            product_id = _model_int_id(item, 'product_id')
            if product_id is None:
                continue
            product = product_map.get(product_id)
            if not product or product.stock < item.quantity:
                locked_order.payment_status = 'failed'
                locked_order.status = 'cancelled'
                locked_order.save(update_fields=['payment_status', 'status', 'updated_at'])
                locked_payment.status = 'failed'
                if gateway_val_id:
                    locked_payment.gateway_val_id = gateway_val_id
                if gateway_payload is not None:
                    locked_payment.gateway_raw_response = json.dumps(gateway_payload)
                locked_payment.save(update_fields=['status', 'gateway_val_id', 'gateway_raw_response', 'updated_at'])
                return {'ok': False, 'error': f'Insufficient stock for "{item.product_name}" during payment confirmation.'}

        for item in items:
            product_id = _model_int_id(item, 'product_id')
            if product_id is None:
                continue
            product = product_map[product_id]
            product.stock -= item.quantity
            product.save(update_fields=['stock'])

        locked_order.payment_status = 'paid'
        locked_order.status = 'confirmed'
        locked_order.save(update_fields=['payment_status', 'status', 'updated_at'])

        locked_payment.status = 'paid'
        locked_payment.paid_at = timezone.now()
        if gateway_val_id:
            locked_payment.gateway_val_id = gateway_val_id
        if gateway_payload is not None:
            locked_payment.gateway_raw_response = json.dumps(gateway_payload)
        locked_payment.save(update_fields=['status', 'paid_at', 'gateway_val_id', 'gateway_raw_response', 'updated_at'])

        if _model_int_id(locked_order, 'user_id') is not None:
            CartItem.objects.filter(user=locked_order.user).delete()

    order_display_id = _order_display_id(locked_order)

    create_user_notification(
        locked_order.user,
        title=f'Payment successful for order #{order_display_id}',
        body='Your payment has been completed and the order is confirmed.',
        notification_type='order',
        related_order=locked_order,
    )
    brand_ids = set(OrderItem.objects.filter(order=locked_order, brand__isnull=False).values_list('brand_id', flat=True))
    for brand in Brand.objects.filter(id__in=brand_ids):
        create_brand_notification(
            brand,
            title=f'Paid order #{order_display_id}',
            body='A new paid order containing your product(s) has been confirmed.',
            notification_type='order',
            related_order=locked_order,
        )

    return {'ok': True, 'already_paid': False}


def _extract_payment_payload(request):
    payload = {}
    if hasattr(request, 'data') and isinstance(request.data, dict):
        payload.update(request.data)
    if hasattr(request, 'POST'):
        payload.update(request.POST.dict())
    if hasattr(request, 'query_params'):
        payload.update(request.query_params.dict())
    return payload


def _normalize_gateway_status(payload):
    for key in ('status', 'pay_status', 'bank_status'):
        value = payload.get(key)
        if value:
            return str(value).upper()
    return ''


def _is_payload_success_fallback(payload, transaction_id, expected_amount):
    # Fallback path for transient validator/API failures.
    payload_tran = payload.get('tran_id')
    if not payload_tran or str(payload_tran) != str(transaction_id):
        return False

    payload_amount = payload.get('amount') or payload.get('store_amount')
    if payload_amount is None:
        return False

    try:
        if Decimal(str(payload_amount)) != expected_amount:
            return False
    except Exception:
        return False

    normalized_status = _normalize_gateway_status(payload)
    return normalized_status in {'VALID', 'VALIDATED', 'SUCCESS'}


# ==================== Checkout / Order Views ====================

@api_view(['POST'])
@permission_classes([AllowAny])
def guest_checkout_view(request):
    """Place an order as guest without creating an account."""
    from django.db import transaction

    serializer = GuestCheckoutSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)

    shipping = {
        'shipping_full_name': data.get('shipping_full_name', ''),
        'shipping_phone': data.get('shipping_phone', ''),
        'shipping_address_line1': data.get('shipping_address_line1', ''),
        'shipping_address_line2': data.get('shipping_address_line2', ''),
        'shipping_city': data.get('shipping_city', ''),
        'shipping_state': data.get('shipping_state', ''),
        'shipping_postal_code': data.get('shipping_postal_code', ''),
        'shipping_country': data.get('shipping_country', ''),
    }

    raw_items = data.get('items', [])
    product_ids = [item['product_id'] for item in raw_items]
    products = list(Product.objects.filter(id__in=product_ids, is_active=True).select_related('brand'))
    product_map = {pid: p for p in products if (pid := _model_int_id(p, 'id')) is not None}

    resolved_items = []
    for raw_item in raw_items:
        product = product_map.get(raw_item['product_id'])
        if not product:
            return Response(
                {'detail': f"Product {raw_item['product_id']} not found or inactive"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quantity = raw_item['quantity']
        if product.stock < quantity:
            return Response(
                {'detail': f'Insufficient stock for "{product.name}". Available: {product.stock}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resolved_items.append((product, raw_item))

    subtotal = sum(
        (product.sale_price if product.is_on_sale else product.price) * item['quantity']
        for product, item in resolved_items
    )
    BASE_SHIPPING_COST = Decimal('60.00')
    FREE_SHIPPING_THRESHOLD = Decimal('5000.00')
    SHIPPING_COST = Decimal('0.00') if subtotal > FREE_SHIPPING_THRESHOLD else BASE_SHIPPING_COST
    total_amount = subtotal + SHIPPING_COST

    payment_method = data.get('payment_method', 'cod')

    if payment_method == 'online':
        order = Order.objects.create(
            user=None,
            guest_checkout=True,
            guest_email=data.get('guest_email'),
            guest_access_token=secrets.token_urlsafe(24),
            payment_method=payment_method,
            payment_status='pending',
            notes=data.get('notes', ''),
            subtotal=subtotal,
            shipping_cost=SHIPPING_COST,
            total_amount=total_amount,
            **shipping,
        )
        payment = SSLPayment.objects.create(
            order=order,
            transaction_id=_generate_transaction_id(_order_display_id(order)),
            payment_gateway='sslcommerz',
            status='pending',
            amount=order.total_amount,
        )

        for product, item in resolved_items:
            unit_price = product.sale_price if product.is_on_sale else product.price
            OrderItem.objects.create(
                order=order,
                product=product,
                brand=product.brand,
                product_name=product.name,
                product_price=unit_price,
                quantity=item['quantity'],
                selected_size=item.get('selected_size') or '',
                selected_color=item.get('selected_color') or '',
            )

        payment_init = _initialize_ssl_payment(request, order, payment)
        if not payment_init.get('ok'):
            # If gateway init fails, treat it as no order placement for online flow.
            payment.status = 'failed'
            payment.gateway_raw_response = json.dumps(payment_init)
            payment.save(update_fields=['status', 'gateway_raw_response', 'updated_at'])
            order.delete()
            return Response({'detail': payment_init.get('error', 'Payment initialization failed.')}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            {
                'payment_required': True,
                'payment_url': payment_init['payment_url'],
                'is_mock': payment_init.get('is_mock', False),
                'gateway_note': payment_init.get('gateway_note', ''),
                'transaction_id': payment.transaction_id,
                'order': OrderSerializer(order).data,
            },
            status=status.HTTP_201_CREATED,
        )

    with transaction.atomic():
        locked_products_list = list(Product.objects.select_for_update().filter(id__in=product_ids))
        locked_products = {pid: p for p in locked_products_list if (pid := _model_int_id(p, 'id')) is not None}

        for product, item in resolved_items:
            locked_product = locked_products[product.id]
            if locked_product.stock < item['quantity']:
                return Response(
                    {'detail': f'Insufficient stock for "{locked_product.name}". Available: {locked_product.stock}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        order = Order.objects.create(
            user=None,
            guest_checkout=True,
            guest_email=data.get('guest_email'),
            guest_access_token=secrets.token_urlsafe(24),
            payment_method=payment_method,
            notes=data.get('notes', ''),
            subtotal=subtotal,
            shipping_cost=SHIPPING_COST,
            total_amount=total_amount,
            **shipping,
        )

        for product, item in resolved_items:
            locked_product = locked_products[product.id]
            unit_price = locked_product.sale_price if locked_product.is_on_sale else locked_product.price
            OrderItem.objects.create(
                order=order,
                product=locked_product,
                brand=locked_product.brand,
                product_name=locked_product.name,
                product_price=unit_price,
                quantity=item['quantity'],
                selected_size=item.get('selected_size') or '',
                selected_color=item.get('selected_color') or '',
            )
            locked_product.stock -= item['quantity']
            locked_product.save(update_fields=['stock'])

    return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkout_view(request):
    """Place an order from the user's current cart"""
    from django.db import transaction

    serializer = CheckoutSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)

    # Resolve shipping address
    address_id = data.get('address_id')
    if address_id:
        try:
            addr = Address.objects.get(id=address_id, user=request.user)
        except Address.DoesNotExist:
            return Response({'detail': 'Address not found'}, status=status.HTTP_404_NOT_FOUND)
        shipping = {
            'shipping_full_name': addr.full_name,
            'shipping_phone': addr.phone or '',
            'shipping_address_line1': addr.address_line1,
            'shipping_address_line2': '',
            'shipping_city': addr.city,
            'shipping_state': '',
            'shipping_postal_code': addr.postal_code or '',
            'shipping_country': '',
        }
    else:
        shipping = {
            'shipping_full_name': data.get('shipping_full_name', ''),
            'shipping_phone': data.get('shipping_phone', ''),
            'shipping_address_line1': data.get('shipping_address_line1', ''),
            'shipping_address_line2': data.get('shipping_address_line2', ''),
            'shipping_city': data.get('shipping_city', ''),
            'shipping_state': data.get('shipping_state', ''),
            'shipping_postal_code': data.get('shipping_postal_code', ''),
            'shipping_country': data.get('shipping_country', ''),
        }

    cart_items = CartItem.objects.filter(user=request.user).select_related('product')
    if not cart_items.exists():
        return Response({'detail': 'Cart is empty'}, status=status.HTTP_400_BAD_REQUEST)

    # Check stock availability
    for item in cart_items:
        if item.product.stock < item.quantity:
            return Response(
                {'detail': f'Insufficient stock for "{item.product.name}". Available: {item.product.stock}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    # Calculate totals
    def _product_price(item):
        product = getattr(item, 'product', None)
        if product is None:
            return 0
        sale_price = getattr(product, 'sale_price', None)
        is_on_sale = getattr(product, 'is_on_sale', False)
        price = getattr(product, 'price', None)
        return (sale_price if is_on_sale and sale_price is not None else price) or 0

    subtotal = sum(
        _product_price(item) * item.quantity
        for item in cart_items
    )
    BASE_SHIPPING_COST = Decimal('60.00')
    FREE_SHIPPING_THRESHOLD = Decimal('5000.00')
    SHIPPING_COST = Decimal('0.00') if subtotal > FREE_SHIPPING_THRESHOLD else BASE_SHIPPING_COST
    total_amount = subtotal + SHIPPING_COST

    payment_method = data.get('payment_method', 'cod')

    if payment_method == 'online':
        order = Order.objects.create(
            user=request.user,
            payment_method=payment_method,
            payment_status='pending',
            notes=data.get('notes', ''),
            subtotal=subtotal,
            shipping_cost=SHIPPING_COST,
            total_amount=total_amount,
            **shipping,
        )
        payment = SSLPayment.objects.create(
            order=order,
            transaction_id=_generate_transaction_id(_model_int_id(order, 'id')),
            payment_gateway='sslcommerz',
            status='pending',
            amount=order.total_amount,
        )

        for item in cart_items:
            unit_price = item.product.sale_price if item.product.is_on_sale else item.product.price
            OrderItem.objects.create(
                order=order,
                product=item.product,
                brand=item.product.brand,
                product_name=item.product.name,
                product_price=unit_price,
                quantity=item.quantity,
                selected_size=item.selected_size,
                selected_color=item.selected_color,
            )

        payment_init = _initialize_ssl_payment(request, order, payment)
        if not payment_init.get('ok'):
            # If gateway init fails, treat it as no order placement for online flow.
            payment.status = 'failed'
            payment.gateway_raw_response = json.dumps(payment_init)
            payment.save(update_fields=['status', 'gateway_raw_response', 'updated_at'])
            order.delete()
            return Response({'detail': payment_init.get('error', 'Payment initialization failed.')}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            {
                'payment_required': True,
                'payment_url': payment_init['payment_url'],
                'is_mock': payment_init.get('is_mock', False),
                'gateway_note': payment_init.get('gateway_note', ''),
                'transaction_id': payment.transaction_id,
                'order': OrderSerializer(order).data,
            },
            status=status.HTTP_201_CREATED,
        )

    # Use atomic transaction to prevent partial failures
    with transaction.atomic():
        # Lock product rows to prevent race conditions
        product_ids = [item.product.pk for item in cart_items]
        products = {p.pk: p for p in Product.objects.select_for_update().filter(pk__in=product_ids)}

        # Re-check stock with locked rows
        for item in cart_items:
            product = products[item.product.pk]  # Use item.product.pk if item.product_id is not available
            if product.stock < item.quantity:
                return Response(
                    {'detail': f'Insufficient stock for "{product.name}". Available: {product.stock}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Create the order
        order = Order.objects.create(
            user=request.user,
            payment_method=payment_method,
            notes=data.get('notes', ''),
            subtotal=subtotal,
            shipping_cost=SHIPPING_COST,
            total_amount=total_amount,
            **shipping
        )

        # Create order items and deduct stock
        for item in cart_items:
            product = products[item.product.pk]
            unit_price = product.sale_price if product.is_on_sale else product.price
            OrderItem.objects.create(
                order=order,
                product=product,
                brand=product.brand,
                product_name=product.name,
                product_price=unit_price,
                quantity=item.quantity,
                selected_size=item.selected_size,
                selected_color=item.selected_color,
            )
            product.stock -= item.quantity
            product.save(update_fields=['stock'])

        # Clear the cart
        cart_items.delete()

    create_user_notification(
        request.user,
        title=f'Order #{order.id} placed',  # type: ignore[attr-defined]
        body='Your order has been placed successfully.',
        notification_type='order',
        related_order=order,
    )

    brand_ids = set(order.items.exclude(brand__isnull=True).values_list('brand_id', flat=True))  # type: ignore[attr-defined]
    for brand in Brand.objects.filter(id__in=brand_ids):
        create_brand_notification(
            brand,
            title=f'New order #{order.id}',  # type: ignore[attr-defined]
            body='You received a new order containing your product(s).',
            notification_type='order',
            related_order=order,
        )

    return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


def _handle_ssl_payment_success(request):
    payload = _extract_payment_payload(request)
    transaction_id = payload.get('tran_id')
    if not transaction_id:
        return Response({'detail': 'tran_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payment = SSLPayment.objects.select_related('order').get(transaction_id=transaction_id)
    except SSLPayment.DoesNotExist:
        return Response({'detail': 'Order not found for transaction'}, status=status.HTTP_404_NOT_FOUND)
    order = payment.order

    if not order:
        return Response({'detail': 'Order is no longer available for this transaction'}, status=status.HTTP_404_NOT_FOUND)

    if order.payment_status == 'paid' or payment.status == 'paid':
        return Response({'message': 'Payment already processed', 'order_id': order.id}, status=status.HTTP_200_OK)  # type: ignore[attr-defined]

    val_id = payload.get('val_id', '')
    try:
        validated = _validate_ssl_payment(val_id, transaction_id)
    except Exception as exc:
        if _is_payload_success_fallback(payload, transaction_id, payment.amount):
            validated = {
                'status': 'VALIDATED',
                'tran_id': transaction_id,
                'amount': str(payment.amount),
                'validation_fallback': True,
                'validation_error': str(exc),
            }
        else:
            return Response({'detail': f'Payment validation failed: {exc}'}, status=status.HTTP_502_BAD_GATEWAY)

    validated_status = str(validated.get('status', '')).upper()
    validated_tran_id = validated.get('tran_id')
    validated_amount = validated.get('amount')

    if validated_tran_id and validated_tran_id != transaction_id:
        return Response({'detail': 'Transaction id mismatch'}, status=status.HTTP_400_BAD_REQUEST)

    if validated_amount is not None:
        try:
            if Decimal(str(validated_amount)) != payment.amount:
                return Response({'detail': 'Amount mismatch'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({'detail': 'Invalid validated amount'}, status=status.HTTP_400_BAD_REQUEST)

    if validated_status not in {'VALID', 'VALIDATED'}:
        order.payment_status = 'failed'
        order.status = 'cancelled'
        order.save(update_fields=['payment_status', 'status', 'updated_at'])
        payment.status = 'failed'
        payment.gateway_val_id = val_id or None
        payment.gateway_raw_response = json.dumps(validated)
        payment.save(update_fields=['status', 'gateway_val_id', 'gateway_raw_response', 'updated_at'])
        order.delete()
        return Response({'detail': 'Payment status is not valid'}, status=status.HTTP_400_BAD_REQUEST)

    completed = _complete_paid_order(payment, gateway_val_id=val_id, gateway_payload=validated)
    if not completed.get('ok'):
        return Response({'detail': completed.get('error', 'Could not finalize paid order')}, status=status.HTTP_409_CONFLICT)

    return Response({'message': 'Payment successful', 'order_id': order.id}, status=status.HTTP_200_OK)  # type: ignore[attr-defined]


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser, MultiPartParser])
def ssl_payment_success_view(request):
    payload = _extract_payment_payload(request)
    transaction_id = payload.get('tran_id', '')

    # Direct browser hits to success URL often have no callback payload.
    # Redirect those to app fail route instead of returning raw 400 JSON.
    if _should_redirect_to_app(request) and not transaction_id:
        redirect_url = _build_app_redirect_url(
            settings.APP_FAIL_URL,
            order_id=None,
            payment_status='failed',
            transaction_id='',
        )
        if redirect_url:
            return _app_redirect_response(redirect_url, title='Payment session missing')

    result = _handle_ssl_payment_success(request)
    if _should_redirect_to_app(request) and result.status_code == status.HTTP_200_OK:
        payment = SSLPayment.objects.select_related('order').filter(transaction_id=transaction_id).first() if transaction_id else None
        order_id = payment.order_id if payment else None  # type: ignore[attr-defined]
        guest_token = payment.order.guest_access_token if payment and payment.order and payment.order.guest_checkout else ''  # type: ignore[attr-defined]
        redirect_url = _build_app_redirect_url(
            settings.APP_SUCCESS_URL,
            order_id=order_id,
            payment_status='paid',
            transaction_id=transaction_id,
            guest_token=guest_token,  # type: ignore[attr-defined]
        )
        if redirect_url:
            return _app_redirect_response(redirect_url, title='Payment successful')
    return result


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser, MultiPartParser])
def ssl_payment_fail_view(request):
    payload = _extract_payment_payload(request)
    transaction_id = payload.get('tran_id')
    if not transaction_id:
        return Response({'detail': 'tran_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payment = SSLPayment.objects.select_related('order').get(transaction_id=transaction_id)
    except SSLPayment.DoesNotExist:
        return Response({'detail': 'Order not found for transaction'}, status=status.HTTP_404_NOT_FOUND)
    order = payment.order

    if payment.status != 'paid':
        payment.status = 'failed'
        payment.gateway_raw_response = json.dumps(payload)
        payment.save(update_fields=['status', 'gateway_raw_response', 'updated_at'])

    if order and order.payment_status != 'paid' and payment.status != 'paid':
        # For online flow, failed payment means order should not remain placed.
        order.delete()

    if _should_redirect_to_app(request):
        redirect_url = _build_app_redirect_url(
            settings.APP_FAIL_URL,
            order_id=None,
            payment_status='failed',
            transaction_id=transaction_id,
        )
        if redirect_url:
            return _app_redirect_response(redirect_url, title='Payment failed')

    return Response({'message': 'Payment marked as failed', 'order_id': None}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser, MultiPartParser])
def ssl_payment_cancel_view(request):
    payload = _extract_payment_payload(request)
    transaction_id = payload.get('tran_id')
    if not transaction_id:
        return Response({'detail': 'tran_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payment = SSLPayment.objects.select_related('order').get(transaction_id=transaction_id)
    except SSLPayment.DoesNotExist:
        return Response({'detail': 'Order not found for transaction'}, status=status.HTTP_404_NOT_FOUND)
    order = payment.order

    if payment.status != 'paid':
        payment.status = 'cancelled'
        payment.gateway_raw_response = json.dumps(payload)
        payment.save(update_fields=['status', 'gateway_raw_response', 'updated_at'])

    if order and order.payment_status != 'paid' and payment.status != 'paid':
        # For online flow, cancelled payment means order should not remain placed.
        order.delete()

    if _should_redirect_to_app(request):
        redirect_url = _build_app_redirect_url(
            settings.APP_CANCEL_URL,
            order_id=None,
            payment_status='cancelled',
            transaction_id=transaction_id,
        )
        if redirect_url:
            return _app_redirect_response(redirect_url, title='Payment cancelled')

    return Response({'message': 'Payment cancelled', 'order_id': None}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser, MultiPartParser])
def mock_payment_success_view(request):
    """Local mock-payment completion used when SSLCommerz is unavailable.

    The frontend opens this URL (passed back as payment_url) so the order is
    marked paid without needing SSLCommerz's servers to call back to a public URL.
    """
    transaction_id = request.GET.get('tran_id') or request.data.get('tran_id') or request.POST.get('tran_id')
    if not transaction_id:
        return Response({'detail': 'tran_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payment = SSLPayment.objects.select_related('order').get(transaction_id=transaction_id)
    except SSLPayment.DoesNotExist:
        return Response({'detail': 'Order not found for transaction'}, status=status.HTTP_404_NOT_FOUND)

    result = _complete_paid_order(payment, gateway_val_id='mock', gateway_payload={'mock': True})
    if not result.get('ok') and not result.get('already_paid'):
        return Response({'detail': result.get('error', 'Payment completion failed')}, status=status.HTTP_400_BAD_REQUEST)

    if _should_redirect_to_app(request):
        order_id = payment.order_id
        guest_token = payment.order.guest_access_token if payment.order and payment.order.guest_checkout else ''
        redirect_url = _build_app_redirect_url(
            settings.APP_SUCCESS_URL,
            order_id=order_id,
            payment_status='paid',
            transaction_id=transaction_id,
            guest_token=guest_token,
        )
        if redirect_url:
            return _app_redirect_response(redirect_url, title='Payment successful (mock)')

    return Response({'message': 'Payment completed (mock)', 'order_id': payment.order_id}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser, MultiPartParser])
def ssl_payment_ipn_view(request):
    return _handle_ssl_payment_success(request)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def order_list_view(request):
    """List all orders for the current user"""
    orders = (
        Order.objects
        .filter(user=request.user)
        .exclude(payment_method='online', payment_status__in=['pending', 'failed'])
        .prefetch_related('items')
    )
    serializer = OrderSerializer(orders, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def order_detail_view(request, order_id):
    """Get a specific order's details"""
    try:
        order = (
            Order.objects
            .prefetch_related('items')
            .exclude(payment_method='online', payment_status__in=['pending', 'failed'])
            .get(id=order_id, user=request.user)
        )
    except Order.DoesNotExist:
        return Response({'detail': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
    return Response(OrderSerializer(order).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def guest_order_detail_view(request, order_id):
    """Get guest order details by order id and guest token."""
    token = request.query_params.get('token')
    if not token:
        return Response({'detail': 'Guest token is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        order = (
            Order.objects
            .prefetch_related('items')
            .exclude(payment_method='online', payment_status__in=['pending', 'failed'])
            .get(
                id=order_id,
                guest_checkout=True,
                guest_access_token=token,
            )
        )
    except Order.DoesNotExist:
        return Response({'detail': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response(OrderSerializer(order).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def order_cancel_view(request, order_id):
    """Cancel a pending/confirmed order (customer or guest)."""
    from django.db import transaction

    user = getattr(request, 'user', None)
    is_auth = bool(user and getattr(user, 'is_authenticated', False))

    # Resolve the order: signed-in user's order, or a guest order via token.
    order = None
    if is_auth:
        order = Order.objects.filter(id=order_id, user=user).first()
    if order is None:
        guest_token = request.data.get('guest_access_token') or request.GET.get('guest_access_token')
        if guest_token:
            order = Order.objects.filter(id=order_id, guest_checkout=True, guest_access_token=guest_token).first()
    if order is None:
        return Response({'detail': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

    if order.status not in ('pending', 'confirmed'):
        return Response(
            {'detail': f'Cannot cancel an order with status "{order.status}"'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Restore stock atomically
    with transaction.atomic():
        for item in order.items.select_related('product'):  # type: ignore[attr-defined]
            if item.product:
                item.product.stock += item.quantity
                item.product.save(update_fields=['stock'])

        order.status = 'cancelled'
        order.save(update_fields=['status', 'updated_at'])

    if order.user:
        create_user_notification(
            order.user,
            title=f'Order #{getattr(order, "id", "")} cancelled',
            body='Your order has been cancelled successfully.',
            notification_type='order',
            related_order=order,
        )  # type: ignore[attr-defined]

    brand_ids = set(order.items.exclude(brand__isnull=True).values_list('brand_id', flat=True))  # type: ignore[attr-defined]
    for brand in Brand.objects.filter(id__in=brand_ids):
        create_brand_notification(
            brand,
            title=f'Order #{getattr(order, "id", "")} cancelled',
            body='A customer cancelled this order.',
            notification_type='order',
            related_order=order,
        )  # type: ignore[attr-defined]

    return Response(OrderSerializer(order).data)


# ---- Brand-side order views ----

@api_view(['GET'])
@permission_classes([AllowAny])
def brand_orders_view(request):
    """List all orders that contain this brand's products"""
    brand = get_brand_from_token(request)
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    # Orders that have at least one item belonging to this brand
    orders = (
        Order.objects
        .filter(items__brand=brand)
        .exclude(payment_method='online', payment_status__in=['pending', 'failed'])
        .prefetch_related('items')
        .distinct()
        .order_by('-created_at')
    )
    serializer = OrderSerializer(orders, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([AllowAny])
def brand_order_detail_view(request, order_id):
    """Get details for one order that contains this brand's products"""
    brand = get_brand_from_token(request)
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        order = (
            Order.objects
            .prefetch_related('items')
            .exclude(payment_method='online', payment_status__in=['pending', 'failed'])
            .get(id=order_id, items__brand=brand)
        )
    except Order.DoesNotExist:
        return Response({'detail': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response(OrderSerializer(order).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def brand_order_status_update_view(request, order_id):
    """Brand updates the status of an order that contains their products"""
    brand = get_brand_from_token(request)
    if not brand:
        return Response({'detail': 'Brand authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    # Ensure at least one item in this order belongs to this brand
    if not Order.objects.filter(id=order_id, items__brand=brand).exists():
        return Response({'detail': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = OrderStatusUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = _validated_data(serializer)

    order = Order.objects.get(id=order_id)
    order.status = data['status']
    order.save(update_fields=['status', 'updated_at'])

    create_user_notification(
        order.user,
        title=f'Order #{data.get("order_id")} update',
        #title=f'Order #{order.id} update',
        body=f'Your order status is now {order.status}.',
        notification_type='order',
        related_order=order,
    )

    return Response(OrderSerializer(order).data)







from rest_framework.permissions import AllowAny
from rest_framework.decorators import permission_classes

@api_view(['GET'])
@permission_classes([AllowAny])
def get_ai_url(request):
    # Configurable via env; defaults to a local fallback predictor served by this
    # backend so the demand-predictor screen works without an external ML server.
    ai_url = os.environ.get('AI_PREDICTION_URL', f"{settings.SITE_URL}/api/auth/predict/demand/")
    return Response({"ai_url": ai_url})


@api_view(['POST'])
@permission_classes([AllowAny])
def predict_demand_view(request):
    """Local fallback demand predictor.

    Computes a simple, explainable weekly forecast from real order history per
    product when no external ML server is configured. Returns the same shape the
    frontend expects: { status, model, predictions, message }.
    """
    from django.db.models import Sum
    from datetime import timedelta

    product_ids = request.data.get('product_ids') or []
    if not isinstance(product_ids, list):
        product_ids = [product_ids]

    try:
        days = int(request.data.get('days', 7))
    except (TypeError, ValueError):
        days = 7

    products = Product.objects.filter(id__in=product_ids, is_active=True)
    predictions = []
    for product in products:
        since = timezone.now() - timedelta(days=days * 4)  # look back ~4 weeks
        sold = (
            OrderItem.objects.filter(
                product=product,
                order__created_at__gte=since,
                order__payment_status='paid',
            ).aggregate(total=Sum('quantity'))['total'] or 0
        )
        weekly_avg = sold / 4.0
        # Light smoothing so brand-new products still get a sensible forecast.
        predicted = round(weekly_avg * 1.1 + 1.0, 1)
        predictions.append({
            'product_id': product.id,
            'week': f'next_{days}_days',
            'predicted_units_sold': max(predicted, 1.0),
            'recent_units_sold': sold,
        })

    model_info = {
        'trained_at': timezone.now().isoformat(),
        'csv_path': 'local-order-history',
        'feature_names': ['recent_units_sold', 'weekly_avg', 'smoothing'],
        'learning_rate': 0.0,
        'epochs': 0,
        'use_rolling_feature': True,
        'final_loss': 0.0,
    }
    return Response({
        'status': 'ok',
        'model': model_info,
        'predictions': predictions,
        'message': 'Local forecast computed from order history.',
    })

  